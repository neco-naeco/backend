import WebSocket from 'ws';
import { RealtimeGateway } from './realtime.gateway';
import type {
  RealtimeAuthService,
  RealtimeDisconnectService,
  RealtimeRoomAccessService,
  RealtimeSupportStateStore,
  RealtimeTurnEditService,
} from '../service/realtime.interfaces';
import { GameRoomParticipantMembershipStatus, GameRoomParticipantRole } from '@shared/enums';

describe('RealtimeGateway disconnect handling', () => {
  it('does not mark the user disconnected until the last socket in the room closes', async () => {
    const authService: jest.Mocked<RealtimeAuthService> = {
      validateAccessToken: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    };
    const roomAccessService: jest.Mocked<RealtimeRoomAccessService> = {
      getJoinRoomState: jest.fn().mockResolvedValue({
        gameRoomId: 'room-1',
        initialState: {
          gameRoomId: 'room-1',
          participants: [
            {
              userId: 'user-1',
              nickname: 'owner',
              role: GameRoomParticipantRole.OWNER,
              membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
            },
          ],
          changedParticipant: null,
          gameState: {},
          missionState: null,
          occurredAt: '2026-05-22T00:00:00+09:00',
        },
      }),
    };
    const disconnectService: jest.Mocked<RealtimeDisconnectService> = {
      handleDisconnect: jest.fn().mockResolvedValue(undefined),
    };
    const turnEditService: jest.Mocked<RealtimeTurnEditService> = {
      authorizeCodeChange: jest.fn(),
    };
    const supportStateStore: jest.Mocked<RealtimeSupportStateStore> = {
      saveCurrentTurnState: jest.fn().mockResolvedValue(undefined),
      getCurrentTurnState: jest.fn(),
      saveLatestFileContent: jest.fn(),
      getLatestFileContent: jest.fn(),
      clearLatestFileContents: jest.fn(),
    };

    const gateway = new RealtimeGateway(
      authService,
      roomAccessService,
      disconnectService,
      turnEditService,
      supportStateStore,
    );

    const firstSocket = createSocket();
    const secondSocket = createSocket();

    await gateway.handleJoinRoom(firstSocket, {
      accessToken: 'token-1',
      gameRoomId: 'room-1',
    });
    await gateway.handleJoinRoom(secondSocket, {
      accessToken: 'token-2',
      gameRoomId: 'room-1',
    });

    await gateway.handleDisconnect(firstSocket);
    expect(disconnectService.handleDisconnect).not.toHaveBeenCalled();

    await gateway.handleDisconnect(secondSocket);
    expect(disconnectService.handleDisconnect).toHaveBeenCalledTimes(1);
    expect(disconnectService.handleDisconnect).toHaveBeenCalledWith({
      gameRoomId: 'room-1',
      userId: 'user-1',
    });
  });
});

function createSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
  } as unknown as WebSocket;
}
