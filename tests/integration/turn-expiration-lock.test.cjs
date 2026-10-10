require('ts-node').register({ transpileOnly: true });
require('tsconfig-paths/register');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { TurnEntity } = require('../../src/modules/turns/entity/turn.entity');
const { TurnsService } = require('../../src/modules/turns/service/turns.service');

test('turn completion reads committed state after waiting on a row lock', async (t) => {
  assert.ok(process.env.ITEM_TEST_DATABASE_URL, 'Set ITEM_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `item_test_${randomUUID().replaceAll('-', '')}`;
  const applicationName = `turn_lock_${randomUUID()}`;
  const db = new DataSource({
    type: 'postgres', url: process.env.ITEM_TEST_DATABASE_URL, schema,
    extra: { options: `-c search_path=${schema},public`, application_name: applicationName },
    entities: [resolve(__dirname, '../../src/modules/**/*.entity.ts')], synchronize: false,
  });
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    // These dependencies must never be reached for a stale/finished turn.
    const service = new TurnsService({}, db, {}, {}, {}, {}, {});
    const turns = db.getRepository(TurnEntity);
    for (const kind of ['extended', 'submitted', 'disconnect', 'manual-submit']) {
      await t.test(kind, async () => {
        const turn = await turns.save(turns.create({
          gameRoomId: randomUUID(), missionId: randomUUID(), playerUserId: randomUUID(),
          turnNumber: 1, status: 'IN_PROGRESS', startedAt: new Date(Date.now() - 60000),
          deadlineAt: new Date(Date.now() - 1000), endedAt: null,
        }));
        const writer = db.createQueryRunner();
        await writer.startTransaction();
        let completion;
        try {
          await writer.manager.getRepository(TurnEntity).findOneOrFail({
            where: { id: turn.id }, lock: { mode: 'pessimistic_write' },
          });
          if (kind === 'extended') {
            await writer.manager.getRepository(TurnEntity).update(turn.id, {
              deadlineAt: new Date(Date.now() + 60000),
            });
          } else {
            await writer.manager.getRepository(TurnEntity).update(turn.id, {
              status: 'SUBMITTED', endedAt: new Date(),
            });
          }
          const input = {
            gameRoomId: turn.gameRoomId, turnId: turn.id, userId: turn.playerUserId,
            occurredAt: new Date().toISOString(), files: [],
          };
          const operation = kind === 'manual-submit'
            ? service.submitTurn(input)
            : service.timeoutTurn({ ...input, reason: kind === 'disconnect' ? 'DISCONNECT' : 'DEADLINE' });
          completion = operation.then(
            () => ({ code: 'UNEXPECTED_SUCCESS' }),
            (error) => error.getResponse?.() ?? { code: 'UNEXPECTED_ERROR', error },
          );
          // Observe actual PostgreSQL lock waiting, rather than assuming a sleep creates a race.
          let waiting = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const [activity] = await db.query(`
              SELECT count(*)::integer AS count FROM pg_stat_activity
              WHERE application_name = $1 AND wait_event_type = 'Lock'
                AND query LIKE '%FOR UPDATE%'
            `, [applicationName]);
            if (activity.count > 0) { waiting = true; break; }
            await delay(20);
          }
          assert.equal(waiting, true, 'completion must wait for the locked turn row');
          await writer.commitTransaction();
          assert.equal((await completion).code,
            kind === 'extended' ? 'TURN_NOT_EXPIRED' : 'TURN_NOT_IN_PROGRESS');
          const saved = await turns.findOneByOrFail({ id: turn.id });
          assert.equal(saved.status, kind === 'extended' ? 'IN_PROGRESS' : 'SUBMITTED');
          if (kind === 'extended') assert.equal(saved.endedAt, null);
          const [snapshots] = await db.query('SELECT count(*)::integer AS count FROM turn_snapshots WHERE turn_id = $1', [turn.id]);
          assert.equal(snapshots.count, 0);
        } finally {
          if (writer.isTransactionActive) await writer.rollbackTransaction();
          await completion;
          await writer.release();
        }
      });
    }
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
});
