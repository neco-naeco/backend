require('ts-node').register({ transpileOnly: true });
require('tsconfig-paths/register');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { User } = require('../../src/modules/auth/entity/user.entity');
const { GameRoomEntity } = require('../../src/modules/game-rooms/entity/game-room.entity');
const { GameRoomParticipantEntity } = require('../../src/modules/game-room-participants/entity/game-room-participant.entity');
const { GameRoomItemEntity } = require('../../src/modules/game-room-items/entity/game-room-item.entity');
const { TurnEntity } = require('../../src/modules/turns/entity/turn.entity');
const { TurnsService } = require('../../src/modules/turns/service/turns.service');
const { GameRoomItemsService } = require('../../src/modules/game-room-items/service/game-room-items.service');

test('atomic game item use in PostgreSQL', async (t) => {
  assert.ok(process.env.ITEM_TEST_DATABASE_URL, 'Set ITEM_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `item_test_${randomUUID().replaceAll('-', '')}`;
  const applicationName = `item_use_${randomUUID()}`;
  const db = new DataSource({
    type: 'postgres', url: process.env.ITEM_TEST_DATABASE_URL, schema,
    extra: { options: `-c search_path=${schema},public`, application_name: applicationName },
    entities: [resolve(__dirname, '../../src/modules/**/*.entity.ts')], synchronize: false,
  });
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    const service = new GameRoomItemsService(db);
    const turns = db.getRepository(TurnEntity);
    const items = db.getRepository(GameRoomItemEntity);
    async function fixture(mode = 'MULTIPLAYER') {
      const user = await db.getRepository(User).save({ loginId: randomUUID(), nickname: randomUUID(), passwordHash: 'test' });
      const room = await db.getRepository(GameRoomEntity).save({
        ownerUserId: user.id, mode, status: 'IN_PROGRESS', difficulty: 'EASY',
        timeLimitSeconds: 30, maxStrikeCount: 3, minParticipants: mode === 'PRACTICE' ? 1 : 2,
        maxParticipants: mode === 'PRACTICE' ? 1 : 4,
      });
      await db.getRepository(GameRoomParticipantEntity).insert({
        gameRoomId: room.id, userId: user.id, role: 'OWNER', membershipStatus: 'JOINED',
      });
      const turn = await turns.save({
        gameRoomId: room.id, playerUserId: user.id, missionId: randomUUID(), turnNumber: 1,
        status: 'IN_PROGRESS', startedAt: new Date(), deadlineAt: new Date(Date.now() + 60000),
      });
      const item = await items.save({ gameRoomId: room.id, itemType: 'TIME_EXTENSION_30', quantity: 1, usedCount: 0 });
      return { room, user, turn, item, input: { gameRoomId: room.id, turnId: turn.id, userId: user.id, itemType: item.itemType } };
    }
    for (const mode of ['MULTIPLAYER', 'PRACTICE']) {
      await t.test(`${mode}: simultaneous use succeeds once, adding exactly 30 seconds`, async () => {
        const f = await fixture(mode);
        const results = await Promise.allSettled([service.useItem(f.input), service.useItem(f.input)]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(results.find((r) => r.status === 'rejected').reason.getResponse().code, 'GAME_ITEM_EXHAUSTED');
        const result = results.find((r) => r.status === 'fulfilled').value;
        assert.deepEqual(result.usedBy, { userId: f.user.id, nickname: f.user.nickname });
        assert.equal(result.effect.addedSeconds, 30);
        const saved = await turns.findOneByOrFail({ id: f.turn.id });
        assert.equal(saved.deadlineAt.getTime(), f.turn.deadlineAt.getTime() + 30000);
        assert.equal(saved.startedAt.getTime(), f.turn.startedAt.getTime());
        assert.equal(saved.status, 'IN_PROGRESS');
        assert.equal(new Date(result.effect.deadlineAt).getTime(), saved.deadlineAt.getTime());
        const item = await items.findOneByOrFail({ id: f.item.id });
        assert.equal(item.quantity, 0);
        assert.equal(item.usedCount, 1);
        // A stale expiration candidate must now be rejected by the actual timeout service.
        const lifecycle = new TurnsService({}, db, {}, {}, {}, {}, {});
        await assert.rejects(lifecycle.timeoutTurn({
          ...f.input, reason: 'DEADLINE', occurredAt: new Date().toISOString(), files: [],
        }), (error) => error.getResponse().code === 'TURN_NOT_EXPIRED');
      });
    }
    await t.test('turn save failure rolls back the already-saved inventory', async () => {
      const f = await fixture();
      const subscriber = {
        listenTo: () => TurnEntity,
        beforeUpdate(event) {
          if (event.entity?.id === f.turn.id) throw new Error('injected turn save failure');
        },
      };
      db.subscribers.push(subscriber);
      try {
        await assert.rejects(service.useItem(f.input), /injected turn save failure/);
      } finally { db.subscribers.splice(db.subscribers.indexOf(subscriber), 1); }
      const item = await items.findOneByOrFail({ id: f.item.id });
      assert.equal(item.quantity, 1);
      assert.equal(item.usedCount, 0);
      assert.equal((await turns.findOneByOrFail({ id: f.turn.id })).deadlineAt.getTime(), f.turn.deadlineAt.getTime());
      await service.useItem(f.input);
    });
    for (const change of ['TIMEOUT', 'SUBMITTED', 'EXPIRED']) {
      await t.test(`waiting item use rechecks committed ${change} state`, async () => {
        const f = await fixture();
        const writer = db.createQueryRunner();
        await writer.startTransaction();
        let completion;
        try {
          await writer.manager.getRepository(TurnEntity).findOneOrFail({
            where: { id: f.turn.id }, lock: { mode: 'pessimistic_write' },
          });
          await writer.manager.getRepository(TurnEntity).update(f.turn.id,
            change === 'EXPIRED' ? { deadlineAt: new Date(Date.now() - 1000) } : { status: change, endedAt: new Date() });
          completion = service.useItem(f.input).then(() => 'UNEXPECTED_SUCCESS', (error) => error.getResponse?.().code);
          let waiting = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const [activity] = await db.query(`SELECT count(*)::integer AS count FROM pg_stat_activity
              WHERE application_name = $1 AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`, [applicationName]);
            if (activity.count > 0) { waiting = true; break; }
            await delay(20);
          }
          assert.equal(waiting, true);
          await writer.commitTransaction();
          assert.equal(await completion, change === 'EXPIRED' ? 'TURN_DEADLINE_EXPIRED' : 'TURN_NOT_IN_PROGRESS');
          const item = await items.findOneByOrFail({ id: f.item.id });
          assert.equal(item.quantity, 1);
          assert.equal(item.usedCount, 0);
        } finally {
          if (writer.isTransactionActive) await writer.rollbackTransaction();
          await completion;
          await writer.release();
        }
      });
    }
    await t.test('LEFT membership and a different current player cannot consume', async () => {
      const f = await fixture();
      const membership = db.getRepository(GameRoomParticipantEntity);
      await membership.update({ gameRoomId: f.room.id }, { membershipStatus: 'LEFT' });
      await assert.rejects(service.useItem(f.input), (error) => error.getResponse().code === 'FORBIDDEN_RESOURCE_ACCESS');
      await membership.update({ gameRoomId: f.room.id }, { membershipStatus: 'JOINED' });
      await turns.update(f.turn.id, { playerUserId: randomUUID() });
      await assert.rejects(service.useItem(f.input), (error) => error.getResponse().code === 'TURN_PLAYER_REQUIRED');
      assert.equal((await items.findOneByOrFail({ id: f.item.id })).quantity, 1);
    });
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
});
