// Opt-in local Docker smoke test. Creates and removes only its own UUID fixtures.
require('ts-node').register({ transpileOnly: true });
require('tsconfig-paths/register');
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { resolve } = require('node:path');
const { DataSource } = require('typeorm');
const { JwtService } = require('@nestjs/jwt');
const WebSocket = require('ws');
const run = promisify(execFile);
const pause = ms => new Promise(r => setTimeout(r, ms));
const { User } = require('../../src/modules/auth/entity/user.entity');
const { GameRoomEntity } = require('../../src/modules/game-rooms/entity/game-room.entity');
const { GameRoomParticipantEntity } = require('../../src/modules/game-room-participants/entity/game-room-participant.entity');
const { GameRoomItemEntity } = require('../../src/modules/game-room-items/entity/game-room-item.entity');
const { TurnEntity } = require('../../src/modules/turns/entity/turn.entity');

async function connect() {
  const ws = new WebSocket('ws://127.0.0.1:8080');
  const queue = [];
  ws.on('message', raw => queue.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return {
    ws,
    send: (event, data) => ws.send(JSON.stringify({ event, data })),
    async receive(event) {
      for (let n = 0; n < 150; n++) {
        const i = queue.findIndex(message => message.event === event);
        if (i >= 0) return queue.splice(i, 1)[0].data;
        if (ws.readyState === WebSocket.CLOSED) throw new Error(`Socket closed waiting for ${event}`);
        await pause(100);
      }
      throw new Error(`Timed out waiting for ${event}`);
    },
  };
}
async function ready() {
  for (let n = 0; n < 120; n++) {
    try { await fetch('http://127.0.0.1:8080/v1/health', { signal: AbortSignal.timeout(1000) }); return; }
    catch { await pause(1000); }
  }
  throw new Error('Backend did not restart');
}

test('live item events and Docker storage recovery', { skip: process.env.ITEM_LIVE_DOCKER_TEST !== '1', timeout: 360000 }, async () => {
  const db = new DataSource({ type: 'postgres', host: '127.0.0.1', port: Number(process.env.ITEM_LIVE_DB_PORT || process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'neconaeco', entities: [resolve(__dirname, '../../src/modules/**/*.entity.ts')], synchronize: false });
  await db.initialize();
  const rooms = [], users = [], sockets = [], fixtures = [];
  const jwt = new JwtService();
  try {
    await ready();
    const cluster = await db.query('SELECT system_identifier::text FROM pg_control_system()');
    const expected = await run('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT system_identifier FROM pg_control_system()"']);
    assert.equal(cluster[0].system_identifier, expected.stdout.trim(), 'Test DB must be the Compose PostgreSQL cluster');
    for (const mode of ['MULTIPLAYER', 'PRACTICE']) {
      const owner = await db.getRepository(User).save({ loginId: randomUUID(), nickname: randomUUID(), passwordHash: 'smoke-test' }); users.push(owner.id);
      const observer = await db.getRepository(User).save({ loginId: randomUUID(), nickname: randomUUID(), passwordHash: 'smoke-test' }); users.push(observer.id);
      const room = await db.getRepository(GameRoomEntity).save({ ownerUserId: owner.id, mode, status: 'IN_PROGRESS', difficulty: 'EASY', timeLimitSeconds: 600, maxStrikeCount: 3, minParticipants: mode === 'PRACTICE' ? 1 : 2, maxParticipants: mode === 'PRACTICE' ? 1 : 4 }); rooms.push(room.id);
      for (const user of mode === 'PRACTICE' ? [owner] : [owner, observer]) await db.getRepository(GameRoomParticipantEntity).insert({ gameRoomId: room.id, userId: user.id, role: user.id === owner.id ? 'OWNER' : 'PARTICIPANT', membershipStatus: 'JOINED' });
      const turn = await db.getRepository(TurnEntity).save({ gameRoomId: room.id, missionId: randomUUID(), playerUserId: owner.id, turnNumber: 1, status: 'IN_PROGRESS', startedAt: new Date(), deadlineAt: new Date(Date.now() + 600000) });
      await db.getRepository(GameRoomItemEntity).insert({ gameRoomId: room.id, itemType: 'TIME_EXTENSION_30' });
      function join(user) { return { gameRoomId: room.id, userId: user.id, accessToken: jwt.sign({ sub: user.id, loginId: user.loginId }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '1h' }) }; }
      const client = await connect(); sockets.push(client.ws); client.send('join-room', join(owner));
      assert.equal((await client.receive('room-participants-updated')).gameState.items[0].remainingQuantity, 1);
      const second = mode === 'MULTIPLAYER' ? await connect() : null;
      const request = { gameRoomId: room.id, turnId: turn.id, itemType: 'TIME_EXTENSION_30' };
      if (second) {
        sockets.push(second.ws); second.send('join-room', join(observer)); await second.receive('room-participants-updated');
        second.send('game-item-use', request); assert.equal((await second.receive('game-item-error')).code, 'TURN_PLAYER_REQUIRED');
      }
      client.send('game-item-use', request); client.send('game-item-use', request);
      const used = await client.receive('game-item-used');
      assert.equal(used.remainingQuantity, 0);
      assert.equal(Date.parse(used.effect.deadlineAt), turn.deadlineAt.getTime() + 30000);
      assert.equal((await client.receive('game-item-error')).code, 'GAME_ITEM_EXHAUSTED');
      if (second) assert.deepEqual(await second.receive('game-item-used'), used);
      client.send('join-room', join(owner));
      const snapshot = await client.receive('room-participants-updated');
      assert.equal(snapshot.gameState.items[0].remainingQuantity, 0);
      assert.equal(Date.parse(snapshot.gameState.turnState.deadlineAt), Date.parse(used.effect.deadlineAt));
      fixtures.push({ room, turn, used });
      console.log(`${mode}: real WebSocket authorization, duplicate use, broadcast and resync passed`);
    }
    await run('docker', ['compose', 'restart', 'app']); await ready();
    for (const f of fixtures) {
      assert.equal((await db.getRepository(GameRoomItemEntity).findOneByOrFail({ gameRoomId: f.room.id })).usedCount, 1);
      assert.equal((await db.getRepository(TurnEntity).findOneByOrFail({ id: f.turn.id })).deadlineAt.getTime(), Date.parse(f.used.effect.deadlineAt));
    }
    console.log('Application restart: inventory and deadline preserved');
    await db.destroy();
    await run('docker', ['compose', 'stop', 'app']);
    await run('docker', ['compose', 'up', '-d', '--no-deps', '--force-recreate', 'postgres']);
    await run('docker', ['compose', 'up', '-d', 'app']); await ready();
    await db.initialize();
    for (const f of fixtures) {
      const item = await db.getRepository(GameRoomItemEntity).findOneByOrFail({ gameRoomId: f.room.id });
      assert.equal(item.quantity, 0); assert.equal(item.usedCount, 1);
      assert.equal((await db.getRepository(TurnEntity).findOneByOrFail({ id: f.turn.id })).deadlineAt.getTime(), Date.parse(f.used.effect.deadlineAt));
    }
    console.log('PostgreSQL container recreation: inventory and deadline preserved');
  } finally {
    for (const ws of sockets) ws.terminate();
    if (!db.isInitialized) {
      await run('docker', ['compose', 'up', '-d', 'app']);
      await ready();
      await db.initialize();
    }
    for (const id of rooms) {
      await db.getRepository(TurnEntity).delete({ gameRoomId: id });
      await db.getRepository(GameRoomParticipantEntity).delete({ gameRoomId: id });
      await db.getRepository(GameRoomEntity).delete(id);
    }
    for (const id of users) await db.getRepository(User).delete(id);
    await db.destroy();
  }
});
