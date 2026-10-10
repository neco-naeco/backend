import { HttpException, Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { GameItemType } from '@shared/enums';
import { GameRoomItemsService, GameItemUseResult } from '@modules/game-room-items/service/game-room-items.service';
import { RealtimeGateway } from './realtime.gateway';
import { GAME_ITEM_ERROR_MESSAGES } from '../service/realtime.constants';

const roomId = '00000000-0000-4000-8000-000000000001';
const turnId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const otherRoom = '00000000-0000-4000-8000-000000000004';
const request = { gameRoomId: roomId, turnId, itemType: GameItemType.TIME_EXTENSION_30 };
const success: GameItemUseResult = {
  ...request, usedBy: { userId, nickname: 'server-name' }, remainingQuantity: 0,
  effect: { addedSeconds: 30, deadlineAt: '2026-10-10T12:01:00.000+09:00' },
  occurredAt: '2026-10-10T12:00:20.000+09:00',
};
const socket = () => ({ readyState: WebSocket.OPEN, send: jest.fn(), close: jest.fn() });
type Socket = ReturnType<typeof socket>;
const frames = (client: Socket) => client.send.mock.calls.map(([frame]) => JSON.parse(frame));

describe('Realtime game items', () => {
  let gateway: RealtimeGateway;
  let useItem: jest.Mock;
  let owner: Socket;
  let peer: Socket;
  let outsider: Socket;
  async function join(client: Socket, gameRoomId = roomId) {
    await gateway.handleJoinRoom(client as unknown as WebSocket, { gameRoomId, accessToken: 'token' });
    client.send.mockClear();
  }
  const send = (payload: unknown = request, client = owner) => gateway.handleGameItemUse(client as unknown as WebSocket, payload);
  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    useItem = jest.fn().mockResolvedValue(success);
    gateway = new RealtimeGateway(
      { useItem } as unknown as GameRoomItemsService,
      { validateAccessToken: async () => ({ userId }) },
      { getJoinRoomState: async ({ gameRoomId }) => ({
        gameRoomId, initialState: { gameRoomId, participants: [], changedParticipant: null,
          gameState: {}, missionState: null, occurredAt: success.occurredAt },
      }) },
      { handleDisconnect: async () => undefined },
      {} as never, {} as never, {} as never,
    );
    owner = socket(); peer = socket(); outsider = socket();
    await join(owner); await join(peer); await join(outsider, otherRoom);
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses session identity and broadcasts committed success including the requester', async () => {
    await send({ ...request, userId: 'forged', nickname: 'forged' });
    expect(useItem).toHaveBeenCalledWith({ ...request, userId });
    expect(frames(owner)).toEqual([{ event: 'game-item-used', data: success }]);
    expect(frames(peer)).toEqual(frames(owner));
    expect(outsider.send).not.toHaveBeenCalled();
  });

  it('does not publish until the service commit promise resolves', async () => {
    let complete!: (value: GameItemUseResult) => void;
    useItem.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const pending = send();
    expect(owner.send).not.toHaveBeenCalled();
    expect(peer.send).not.toHaveBeenCalled();
    complete(success);
    await pending;
    expect(frames(peer)[0].event).toBe('game-item-used');
  });

  it.each([null, [], {}, 'invalid', { ...request, turnId: 1 }, { ...request, itemType: 'TURN_PASS' }])(
    'rejects malformed payload %p without calling the service', async (payload) => {
      await send(payload);
      expect(useItem).not.toHaveBeenCalled();
      expect(frames(owner)[0]).toMatchObject({ event: 'game-item-error', data: { code: 'INVALID_GAME_ITEM_REQUEST' } });
      expect(peer.send).not.toHaveBeenCalled();
      expect(owner.close).not.toHaveBeenCalled();
    },
  );

  it('normalizes invalid correlation fields to null', async () => {
    await send({ gameRoomId: roomId, turnId: 123, itemType: 'bad' });
    expect(frames(owner)[0].data).toMatchObject({ gameRoomId: roomId, turnId: null, itemType: null });
  });

  it('rejects unjoined and cross-room requests without touching inventory', async () => {
    const unjoined = socket();
    await send(request, unjoined);
    expect(frames(unjoined)[0].data.code).toBe('AUTH_REQUIRED');
    await send({ ...request, gameRoomId: otherRoom });
    expect(frames(owner)[0].data.code).toBe('FORBIDDEN_RESOURCE_ACCESS');
    expect(useItem).not.toHaveBeenCalled();
  });

  it.each(Object.keys(GAME_ITEM_ERROR_MESSAGES))('sends %s only to requester with a safe message', async (code) => {
    useItem.mockRejectedValue(new HttpException({ code, message: 'private database details' }, 409));
    await send();
    expect(frames(owner)[0]).toMatchObject({ event: 'game-item-error', data: { ...request, code } });
    expect(JSON.stringify(frames(owner))).not.toContain('private database details');
    expect(peer.send).not.toHaveBeenCalled();
    expect(outsider.send).not.toHaveBeenCalled();
    expect(owner.close).not.toHaveBeenCalled();
  });

  it('maps unexpected failures to a resynchronization error', async () => {
    useItem.mockRejectedValue(new Error('private database details'));
    await send();
    expect(frames(owner)[0].data.code).toBe('GAME_ITEM_INTERNAL_ERROR');
    expect(JSON.stringify(frames(owner))).not.toContain('private database details');
    expect(useItem).toHaveBeenCalledTimes(1);
  });

  it.each(['throw', 'callback', 'closed'])('isolates %s delivery failures after commit', async (failure) => {
    if (failure === 'throw') owner.send.mockImplementation(() => { throw new Error('send failed'); });
    if (failure === 'callback') owner.send.mockImplementation((_frame, callback) => callback(new Error('send failed')));
    if (failure === 'closed') Object.assign(owner, { readyState: WebSocket.CLOSED });
    await expect(send()).resolves.toBeUndefined();
    expect(useItem).toHaveBeenCalledTimes(1);
    expect(frames(peer)).toEqual([{ event: 'game-item-used', data: success }]);
    expect(frames(owner).every((frame) => frame.event === 'game-item-used')).toBe(true);
  });
});
