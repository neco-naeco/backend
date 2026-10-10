import { DataSource } from 'typeorm';
import { User } from '@modules/auth/entity/user.entity';
import { GameRoomParticipantEntity } from '@modules/game-room-participants/entity/game-room-participant.entity';
import { GameRoomEntity } from '@modules/game-rooms/entity/game-room.entity';
import { TurnEntity } from '@modules/turns/entity/turn.entity';
import { GameItemType, TurnStatus } from '@shared/enums';
import { GameRoomItemEntity } from '../entity/game-room-item.entity';
import { GameRoomItemsService } from './game-room-items.service';

const roomId = '00000000-0000-4000-8000-000000000001';
const turnId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const input = { gameRoomId: roomId, turnId, userId, itemType: GameItemType.TIME_EXTENSION_30 };

describe('GameRoomItemsService', () => {
  const now = new Date('2026-10-10T03:00:00Z');
  let service: GameRoomItemsService;
  let turn: { id: string; status: TurnStatus; playerUserId: string; deadlineAt: Date };
  let turns: { findOne: jest.Mock; save: jest.Mock };
  let items: { findOne: jest.Mock; save: jest.Mock };
  let rooms: { findOneBy: jest.Mock };
  let participants: { findOne: jest.Mock };
  let users: { findOneBy: jest.Mock };
  let transaction: jest.Mock;
  let query: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    turn = { id: turnId, status: TurnStatus.IN_PROGRESS, playerUserId: userId, deadlineAt: new Date(now.getTime() + 1000) };
    turns = { findOne: jest.fn().mockResolvedValue(turn), save: jest.fn() };
    items = { findOne: jest.fn().mockResolvedValue({ quantity: 1, usedCount: 0 }), save: jest.fn() };
    rooms = { findOneBy: jest.fn().mockResolvedValue({ id: roomId, status: 'IN_PROGRESS' }) };
    participants = { findOne: jest.fn().mockResolvedValue({ userId }) };
    users = { findOneBy: jest.fn().mockResolvedValue({ id: userId, nickname: 'server-name' }) };
    const repositories = new Map<unknown, unknown>([
      [TurnEntity, turns], [GameRoomItemEntity, items], [GameRoomEntity, rooms],
      [GameRoomParticipantEntity, participants], [User, users],
    ]);
    query = jest.fn();
    const manager = { query, getRepository: (entity: unknown) => repositories.get(entity) };
    transaction = jest.fn(async (callback) => callback(manager));
    service = new GameRoomItemsService({ transaction } as unknown as DataSource);
  });
  afterEach(() => jest.useRealTimers());

  it('adds to the stored deadline and returns server identity only after commit', async () => {
    const callbackTransaction = transaction.getMockImplementation()!;
    let commit: () => void = () => undefined;
    const committed = new Promise<void>((resolve) => { commit = resolve; });
    transaction.mockImplementation(async (callback) => {
      const result = await callbackTransaction(callback);
      await committed;
      return result;
    });
    let resolved = false;
    const pending = service.useItem(input).then((result) => { resolved = true; return result; });
    await jest.runAllTimersAsync();
    expect(turns.save).toHaveBeenCalled();
    expect(resolved).toBe(false);
    commit();
    const result = await pending;
    expect(result).toMatchObject({
      remainingQuantity: 0, usedBy: { userId, nickname: 'server-name' },
      effect: { addedSeconds: 30, deadlineAt: '2026-10-10T12:00:31.000+09:00' },
    });
    expect(items.save).toHaveBeenCalledWith({ quantity: 0, usedCount: 1 });
    expect(turns.findOne).toHaveBeenNthCalledWith(1, {
      where: { id: turnId, gameRoomId: roomId }, lock: { mode: 'pessimistic_write' },
    });
    expect(items.findOne).toHaveBeenCalledWith({
      where: { gameRoomId: roomId, itemType: input.itemType }, lock: { mode: 'pessimistic_write' },
    });
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(turns.findOne.mock.invocationCallOrder[0]);
    expect(turns.findOne.mock.invocationCallOrder[0]).toBeLessThan(items.findOne.mock.invocationCallOrder[0]);
  });

  it.each([
    ['invalid room ID', { gameRoomId: 'bad' }, 'INVALID_GAME_ITEM_REQUEST'],
    ['unsupported item', { itemType: 'TURN_PASS' }, 'INVALID_GAME_ITEM_REQUEST'],
    ['missing actor', { userId: '' }, 'AUTH_REQUIRED'],
  ])('rejects %s before opening a transaction', async (_label, overrides, code) => {
    await expect(service.useItem({ ...input, ...overrides } as typeof input)).rejects.toMatchObject({ response: { code } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    'FORBIDDEN_RESOURCE_ACCESS', 'GAME_ROOM_NOT_FOUND', 'GAME_ROOM_NOT_IN_PROGRESS',
    'TURN_MISMATCH', 'TURN_NOT_IN_PROGRESS', 'TURN_PLAYER_REQUIRED', 'GAME_ITEM_EXHAUSTED',
  ])('rejects %s without writing', async (code) => {
    if (code === 'FORBIDDEN_RESOURCE_ACCESS') participants.findOne.mockResolvedValue(null);
    if (code === 'GAME_ROOM_NOT_FOUND') rooms.findOneBy.mockResolvedValue(null);
    if (code === 'GAME_ROOM_NOT_IN_PROGRESS') rooms.findOneBy.mockResolvedValue({ status: 'FINISHED' });
    if (code === 'TURN_MISMATCH') turns.findOne.mockResolvedValue(null);
    if (code === 'TURN_NOT_IN_PROGRESS') turn.status = TurnStatus.SUBMITTED;
    if (code === 'TURN_PLAYER_REQUIRED') turn.playerUserId = 'another-user';
    if (code === 'GAME_ITEM_EXHAUSTED') items.findOne.mockResolvedValue({ quantity: 0, usedCount: 1 });
    await expect(service.useItem(input)).rejects.toMatchObject({ response: { code } });
    expect(items.save).not.toHaveBeenCalled();
    expect(turns.save).not.toHaveBeenCalled();
  });

  it('rejects an older in-progress turn even when its actor matches', async () => {
    turns.findOne.mockResolvedValueOnce(turn).mockResolvedValueOnce({ id: 'newer-turn' });
    await expect(service.useItem(input)).rejects.toMatchObject({ response: { code: 'TURN_MISMATCH' } });
    expect(items.save).not.toHaveBeenCalled();
  });

  it('does not create inventory for legacy rooms', async () => {
    items.findOne.mockResolvedValue(null);
    await expect(service.useItem(input)).rejects.toMatchObject({ response: { code: 'GAME_ITEM_EXHAUSTED' } });
    expect(items.save).not.toHaveBeenCalled();
  });

  it.each([-1, 0, 1])('checks the deadline boundary at offset %i ms', async (offset) => {
    turn.deadlineAt = new Date(now.getTime() + offset);
    if (offset > 0) {
      await expect(service.useItem(input)).resolves.toMatchObject({ remainingQuantity: 0 });
    } else {
      await expect(service.useItem(input)).rejects.toMatchObject({ response: { code: 'TURN_DEADLINE_EXPIRED' } });
      expect(items.save).not.toHaveBeenCalled();
    }
  });

  it('checks the clock after waiting for the turn lock, not at request start', async () => {
    turns.findOne.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date(now.getTime() + 2000));
      return turn;
    });
    await expect(service.useItem(input)).rejects.toMatchObject({ response: { code: 'TURN_DEADLINE_EXPIRED' } });
    expect(items.save).not.toHaveBeenCalled();
  });
});
