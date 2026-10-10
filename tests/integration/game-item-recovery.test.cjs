require('ts-node').register({ transpileOnly: true });
require('tsconfig-paths/register');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { User } = require('../../src/modules/auth/entity/user.entity');
const { GameRoomEntity } = require('../../src/modules/game-rooms/entity/game-room.entity');
const { GameRoomParticipantEntity } = require('../../src/modules/game-room-participants/entity/game-room-participant.entity');
const { GameRoomItemEntity } = require('../../src/modules/game-room-items/entity/game-room-item.entity');
const { TurnEntity } = require('../../src/modules/turns/entity/turn.entity');
const { GameRoomItemsService } = require('../../src/modules/game-room-items/service/game-room-items.service');
const { RealtimeRoomStateService } = require('../../src/modules/realtime/service/realtime-room-state.service');
const { DatabaseRealtimeRoomAccessService } = require('../../src/modules/realtime/service/realtime-room-access.service');
const { RealtimeTurnTimeoutService } = require('../../src/modules/realtime/service/realtime-turn-timeout.service');

test('durable item snapshot recovery', async (t) => {
  assert.ok(process.env.ITEM_TEST_DATABASE_URL);
  const schema = `item_test_${randomUUID().replaceAll('-', '')}`;
  const options = {
    type: 'postgres', url: process.env.ITEM_TEST_DATABASE_URL, schema,
    extra: { options: `-c search_path=${schema},public` },
    entities: [resolve(__dirname, '../../src/modules/**/*.entity.ts')], synchronize: false,
  };
  const db = new DataSource(options);
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    const state = new RealtimeRoomStateService(db);
    const access = new DatabaseRealtimeRoomAccessService(db, state);
    const use = new GameRoomItemsService(db);
    async function fixture(mode = 'MULTIPLAYER') {
      const user = await db.getRepository(User).save({ loginId: randomUUID(), nickname: randomUUID(), passwordHash: 'test' });
      const room = await db.getRepository(GameRoomEntity).save({
        ownerUserId: user.id, mode, status: 'IN_PROGRESS', difficulty: 'EASY',
        timeLimitSeconds: 30, maxStrikeCount: 3, minParticipants: 1, maxParticipants: 4,
      });
      await db.getRepository(GameRoomParticipantEntity).insert({
        gameRoomId: room.id, userId: user.id, role: 'OWNER', membershipStatus: 'JOINED',
      });
      const turn = await db.getRepository(TurnEntity).save({
        gameRoomId: room.id, missionId: randomUUID(), playerUserId: user.id, turnNumber: 1,
        status: 'IN_PROGRESS', startedAt: new Date(), deadlineAt: new Date(Date.now() + 60000),
      });
      await db.getRepository(GameRoomItemEntity).insert({ gameRoomId: room.id, itemType: 'TIME_EXTENSION_30' });
      const input = { gameRoomId: room.id, userId: user.id, turnId: turn.id, itemType: 'TIME_EXTENSION_30' };
      return { room, turn, input };
    }
    for (const mode of ['MULTIPLAYER', 'PRACTICE']) {
      await t.test(`${mode}: recovers committed use without a success broadcast, including in a fresh process`, async () => {
        const f = await fixture(mode);
        assert.equal((await access.getJoinRoomState(f.input)).initialState.gameState.items[0].remainingQuantity, 1);
        const used = await use.useItem(f.input); // Intentionally never publish game-item-used.
        const rejoined = await access.getJoinRoomState(f.input);
        assert.equal(rejoined.initialState.gameState.items[0].remainingQuantity, 0);
        assert.equal(rejoined.initialState.gameState.turnState.deadlineAt, used.effect.deadlineAt);
        const child = await promisify(execFile)(process.execPath, ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', '-e', `
          const { DataSource } = require('typeorm');
          const { RealtimeRoomStateService } = require('./src/modules/realtime/service/realtime-room-state.service');
          const { DatabaseRealtimeRoomAccessService } = require('./src/modules/realtime/service/realtime-room-access.service');
          (async () => {
            const db = new DataSource(JSON.parse(process.env.RECOVERY_DB_OPTIONS));
            await db.initialize();
            try {
              const service = new DatabaseRealtimeRoomAccessService(db, new RealtimeRoomStateService(db));
              process.stdout.write(JSON.stringify(await service.getJoinRoomState(JSON.parse(process.env.RECOVERY_INPUT))));
            } finally { await db.destroy(); }
          })().catch(error => { console.error(error); process.exitCode = 1; });
        `], { env: { ...process.env, RECOVERY_DB_OPTIONS: JSON.stringify(options), RECOVERY_INPUT: JSON.stringify(f.input) }, timeout: 15000 });
        const restored = JSON.parse(child.stdout).initialState.gameState;
        assert.equal(restored.items[0].remainingQuantity, 0);
        assert.equal(restored.turnState.deadlineAt, used.effect.deadlineAt);
        assert.equal(restored.turnState.status, 'IN_PROGRESS');
        // Restarted sweep scheduling queries the persisted, extended deadline.
        const expired = [];
        const sweep = new RealtimeTurnTimeoutService(db, {
          timeoutTurn: async (input) => { expired.push(input.turnId); return {}; },
        }, { publishTurnLifecycleResult: async () => undefined }, { listLatestFileContents: async () => [] });
        await sweep.processExpiredTurns(f.turn.deadlineAt);
        assert.equal(expired.includes(f.turn.id), false);
        await sweep.processExpiredTurns(new Date(Date.parse(used.effect.deadlineAt) + 1));
        assert.equal(expired.includes(f.turn.id), true);
      });
    }
    await t.test('a use committed during snapshot reading cannot mix old quantity with new deadline', async () => {
      const f = await fixture();
      let injected = false;
      const subscriber = {
        listenTo: () => GameRoomItemEntity,
        async afterLoad(entity) {
          if (entity.gameRoomId === f.room.id && !injected) {
            injected = true;
            await use.useItem(f.input);
          }
        },
      };
      db.subscribers.push(subscriber);
      let snapshot;
      try { snapshot = await state.loadRoomRealtimeContext(f.room.id); }
      finally { db.subscribers.splice(db.subscribers.indexOf(subscriber), 1); }
      assert.equal(injected, true);
      assert.equal(snapshot.gameState.items[0].remainingQuantity, 1);
      assert.equal(Date.parse(snapshot.gameState.turnState.deadlineAt), f.turn.deadlineAt.getTime());
      const next = await state.loadRoomRealtimeContext(f.room.id);
      assert.equal(next.gameState.items[0].remainingQuantity, 0);
      assert.equal(Date.parse(next.gameState.turnState.deadlineAt), f.turn.deadlineAt.getTime() + 30000);
    });
    await t.test('finished games retain inventory and LEFT participants cannot rejoin', async () => {
      const f = await fixture();
      await use.useItem(f.input);
      await db.getRepository(GameRoomEntity).update(f.room.id, { status: 'FINISHED' });
      const snapshot = await access.getJoinRoomState(f.input);
      assert.equal(snapshot.initialState.gameState.status, 'FINISHED');
      assert.equal(snapshot.initialState.gameState.items[0].remainingQuantity, 0);
      assert.equal(snapshot.initialState.gameState.turnState, undefined);
      await db.getRepository(GameRoomParticipantEntity).update({ gameRoomId: f.room.id }, { membershipStatus: 'LEFT' });
      await assert.rejects(access.getJoinRoomState(f.input), (error) => error.getStatus() === 403);
      assert.equal((await db.getRepository(GameRoomItemEntity).findOneByOrFail({ gameRoomId: f.room.id })).usedCount, 1);
    });
    await t.test('legacy and waiting rooms report zero without allocating', async () => {
      const f = await fixture();
      await db.getRepository(GameRoomItemEntity).delete({ gameRoomId: f.room.id });
      for (const status of ['IN_PROGRESS', 'WAITING']) {
        await db.getRepository(GameRoomEntity).update(f.room.id, { status });
        assert.deepEqual((await state.loadRoomRealtimeContext(f.room.id)).gameState.items,
          [{ itemType: 'TIME_EXTENSION_30', remainingQuantity: 0 }]);
      }
      assert.equal(await db.getRepository(GameRoomItemEntity).countBy({ gameRoomId: f.room.id }), 0);
    });
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
});
