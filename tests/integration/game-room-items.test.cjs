// Requires a disposable PostgreSQL database; every run uses its own schema.
require('ts-node').register({ transpileOnly: true });
require('tsconfig-paths/register');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { DataSource } = require('typeorm');
const { GameRoomItemEntity } = require('../../src/modules/game-room-items/entity/game-room-item.entity');
const { GameRoomEntity } = require('../../src/modules/game-rooms/entity/game-room.entity');
const { GameRoomParticipantEntity } = require('../../src/modules/game-room-participants/entity/game-room-participant.entity');
const { GameRoomsService } = require('../../src/modules/game-rooms/service/game-rooms.service');
const { CreateGameRoomItems1779800000002 } = require('../../database/migrations/1779800000002-CreateGameRoomItems');
const { GameMode, GameItemType, GameRoomStatus } = require('../../src/shared/enums');

test('game item migration and transactional game-start allocation', async (t) => {
  assert.ok(process.env.ITEM_TEST_DATABASE_URL, 'Set ITEM_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `item_test_${randomUUID().replaceAll('-', '')}`;
  const db = new DataSource({
    type: 'postgres',
    url: process.env.ITEM_TEST_DATABASE_URL,
    schema,
    extra: { options: `-c search_path=${schema},public` },
    entities: [resolve(__dirname, '../../src/modules/**/*.entity.ts')],
    synchronize: false,
  });
  await db.initialize();
  const runner = db.createQueryRunner();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    const migration = new CreateGameRoomItems1779800000002();
    await migration.down(runner);
    await migration.up(runner);
    const items = db.getRepository(GameRoomItemEntity);
    const rooms = db.getRepository(GameRoomEntity);
    const released = [];
    const missions = {
      createMissionForGameStart: async () => ({ id: randomUUID(), containerId: 'test-runtime' }),
      validateMissionTemplateSelection: async () => ({}),
      transitionCurrentStepToInProgress: async () => ({ id: randomUUID() }),
      releasePreparedRuntimeContainer: async (id) => released.push(id),
    };
    // Runtime/mission work is stubbed; room, participant and inventory writes use PostgreSQL.
    const service = new GameRoomsService(db, missions, {
      createInitialTurn: async () => ({ id: randomUUID() }),
    });
    async function waitingRoom(mode) {
      const room = await service.createRoom({
        ownerUserId: randomUUID(), mode, difficulty: 'EASY',
        timeLimitSeconds: 30, maxStrikeCount: 3,
        minParticipants: mode === GameMode.PRACTICE ? 1 : 2,
        maxParticipants: mode === GameMode.PRACTICE ? 1 : 4,
      });
      if (mode === GameMode.MULTIPLAYER) {
        await db.getRepository(GameRoomParticipantEntity).insert({
          gameRoomId: room.id, userId: randomUUID(), role: 'PARTICIPANT', membershipStatus: 'JOINED',
        });
      }
      assert.equal(await items.countBy({ gameRoomId: room.id }), 0);
      return room;
    }
    const start = (room) => service.startGame({
      gameRoomId: room.id, actorUserId: room.ownerUserId, missionTemplateId: randomUUID(),
    });
    const inventory = (room) => items.findOneByOrFail({ gameRoomId: room.id });

    for (const mode of [GameMode.MULTIPLAYER, GameMode.PRACTICE]) {
      await t.test(`${mode}: concurrent starts allocate once and retries never refill`, async () => {
        const room = await waitingRoom(mode);
        const results = await Promise.allSettled([start(room), start(room)]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
        assert.equal(await items.countBy({ gameRoomId: room.id }), 1);
        const item = await inventory(room);
        assert.equal(item.itemType, GameItemType.TIME_EXTENSION_30);
        assert.equal(item.quantity, 1);
        assert.equal(item.usedCount, 0);
        await items.update(item.id, { quantity: 0, usedCount: 1 });
        await assert.rejects(start(room));
        await service.listAccessibleRooms(room.ownerUserId);
        assert.equal((await inventory(room)).quantity, 0);
        assert.equal((await inventory(room)).usedCount, 1);
      });
    }

    await t.test('failure after inventory insertion rolls back allocation and room status', async () => {
      const room = await waitingRoom(GameMode.PRACTICE);
      const subscriber = {
        listenTo: () => GameRoomEntity,
        beforeUpdate(event) {
          if (event.entity?.id === room.id && event.entity.status === GameRoomStatus.IN_PROGRESS) {
            throw new Error('injected failure after inventory insertion');
          }
        },
      };
      db.subscribers.push(subscriber);
      try {
        await assert.rejects(start(room), /injected failure after inventory insertion/);
      } finally {
        db.subscribers.splice(db.subscribers.indexOf(subscriber), 1);
      }
      assert.equal(await items.countBy({ gameRoomId: room.id }), 0);
      assert.equal((await rooms.findOneByOrFail({ id: room.id })).status, GameRoomStatus.WAITING);
      assert.deepEqual(released, ['test-runtime']);
      await start(room);
      assert.equal((await inventory(room)).quantity, 1);
    });

    await t.test('unique, nonnegative, foreign key and cascade constraints', async () => {
      const room = await waitingRoom(GameMode.PRACTICE);
      await items.insert({ gameRoomId: room.id, itemType: GameItemType.TIME_EXTENSION_30 });
      const item = await inventory(room);
      assert.equal(item.quantity, 1);
      assert.equal(item.usedCount, 0);
      assert.ok(item.createdAt instanceof Date && item.updatedAt instanceof Date);
      const rejectsCode = (operation, code) => assert.rejects(operation, (error) => error.driverError?.code === code);
      await rejectsCode(items.insert({ gameRoomId: room.id, itemType: item.itemType }), '23505');
      await rejectsCode(items.update(item.id, { quantity: -1 }), '23514');
      await rejectsCode(items.update(item.id, { usedCount: -1 }), '23514');
      await rejectsCode(items.insert({ gameRoomId: randomUUID(), itemType: item.itemType }), '23503');
      await rooms.delete(room.id);
      assert.equal(await items.countBy({ gameRoomId: room.id }), 0);
    });

    await t.test('migration down/up leaves pre-existing games without retroactive inventory', async () => {
      const room = await waitingRoom(GameMode.PRACTICE);
      await start(room);
      await migration.down(runner);
      assert.equal(await runner.hasTable(`${schema}.game_room_items`), false);
      await migration.up(runner);
      assert.equal(await items.count(), 0);
      await assert.rejects(start(room));
      assert.equal(await items.countBy({ gameRoomId: room.id }), 0);
    });
  } finally {
    await runner.release();
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
});
