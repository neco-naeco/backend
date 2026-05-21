/// <reference types="jest" />
import { ForbiddenException, INestApplication, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import WebSocket from 'ws';
import { NecoWsAdapter } from '../../../integrations/websocket/neco-ws.adapter';
import { GameRoomParticipantMembershipStatus, GameRoomParticipantRole } from '../../../shared/enums';
import { RealtimeModule } from '../realtime.module';
import {
  REALTIME_AUTH_SERVICE,
  REALTIME_ASSISTIVE_MESSAGE_SERVICE,
  REALTIME_DISCONNECT_SERVICE,
  REALTIME_ROOM_ACCESS_SERVICE,
  REALTIME_SUPPORT_STATE_STORE,
  REALTIME_TURN_SUBMIT_SERVICE,
  REALTIME_TURN_EDIT_SERVICE,
} from '../service/realtime.constants';
import {
  RealtimeAuthService,
  RealtimeAssistiveMessageService,
  RealtimeDisconnectService,
  RealtimeJoinRoomState,
  RealtimeRoomAccessService,
  RealtimeSupportStateStore,
  RealtimeTurnSubmitService,
  RealtimeTurnEditService,
} from '../service/realtime.interfaces';

describe('RealtimeGateway', () => {
  let app: INestApplication;
  let port: number;
  let authService: jest.Mocked<RealtimeAuthService>;
  let roomAccessService: jest.Mocked<RealtimeRoomAccessService>;
  let disconnectService: jest.Mocked<RealtimeDisconnectService>;
  let turnEditService: jest.Mocked<RealtimeTurnEditService>;
  let turnSubmitService: jest.Mocked<RealtimeTurnSubmitService>;
  let assistiveMessageService: jest.Mocked<RealtimeAssistiveMessageService>;
  let supportStateStore: RealtimeSupportStateStore;

  beforeEach(async () => {
    authService = {
      validateAccessToken: jest.fn(),
    };
    roomAccessService = {
      getJoinRoomState: jest.fn(),
    };
    disconnectService = {
      handleDisconnect: jest.fn(),
    };
    turnEditService = {
      authorizeCodeChange: jest.fn(),
    };
    turnSubmitService = {
      submitTurn: jest.fn(),
    };
    assistiveMessageService = {
      buildNotice: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [RealtimeModule],
    })
      .overrideProvider(REALTIME_AUTH_SERVICE)
      .useValue(authService)
      .overrideProvider(REALTIME_ROOM_ACCESS_SERVICE)
      .useValue(roomAccessService)
      .overrideProvider(REALTIME_DISCONNECT_SERVICE)
      .useValue(disconnectService)
      .overrideProvider(REALTIME_TURN_EDIT_SERVICE)
      .useValue(turnEditService)
      .overrideProvider(REALTIME_TURN_SUBMIT_SERVICE)
      .useValue(turnSubmitService)
      .overrideProvider(REALTIME_ASSISTIVE_MESSAGE_SERVICE)
      .useValue(assistiveMessageService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new NecoWsAdapter(app));
    await app.listen(0);
    supportStateStore = app.get(REALTIME_SUPPORT_STATE_STORE);

    const address = app.getHttpServer().address();
    port = typeof address === 'string' ? 0 : address.port;
  });

  afterEach(async () => {
    await app.close();
  });

  it('closes with 4401 when the token is invalid', async () => {
    authService.validateAccessToken.mockRejectedValue(new UnauthorizedException());

    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    sendJoinRoom(socket, {
      accessToken: 'invalid-token',
      gameRoomId: 'room-001',
      userId: 'user-001',
    });

    await expect(closeEvent).resolves.toEqual({
      code: 4401,
      reason: 'AUTH_TOKEN_INVALID',
    });
  });

  it('closes with 4403 when room access is forbidden', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockRejectedValue(new ForbiddenException());

    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    sendJoinRoom(socket, {
      accessToken: 'valid-token',
      gameRoomId: 'room-001',
      userId: 'user-999',
    });

    await expect(closeEvent).resolves.toEqual({
      code: 4403,
      reason: 'FORBIDDEN_RESOURCE_ACCESS',
    });
  });

  it('closes with 4404 when the room does not exist', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockRejectedValue(new NotFoundException());

    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    sendJoinRoom(socket, {
      accessToken: 'valid-token',
      gameRoomId: 'missing-room',
      userId: 'user-001',
    });

    await expect(closeEvent).resolves.toEqual({
      code: 4404,
      reason: 'GAME_ROOM_NOT_FOUND',
    });
  });

  it('closes with 4404 when gameRoomId is missing from the payload', async () => {
    const socket = await connectClient(port);
    const closeEvent = waitForClose(socket);

    socket.send(
      JSON.stringify({
        event: 'join-room',
        data: {
          accessToken: 'valid-token',
        },
      }),
    );

    await expect(closeEvent).resolves.toEqual({
      code: 4404,
      reason: 'GAME_ROOM_NOT_FOUND',
    });
    expect(authService.validateAccessToken).not.toHaveBeenCalled();
    expect(roomAccessService.getJoinRoomState).not.toHaveBeenCalled();
  });

  it('sends the latest allowed state on successful join', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockResolvedValue(createJoinRoomState());

    const socket = await connectClient(port);
    const messageEvent = waitForMessage(socket);

    sendJoinRoom(socket, {
      accessToken: 'valid-token',
      gameRoomId: 'room-001',
      userId: 'forged-user-id',
    });

    await expect(messageEvent).resolves.toEqual({
      event: 'room-participants-updated',
      data: createJoinRoomState().initialState,
    });
    expect(roomAccessService.getJoinRoomState).toHaveBeenCalledWith({
      gameRoomId: 'room-001',
      userId: 'user-001',
    });
    socket.close();
  });

  it('caches current turn support state from join-room payload when the room is in progress', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockResolvedValue(createJoinRoomStateInProgress());

    const socket = await connectClient(port);
    const messageEvent = waitForMessage(socket);

    sendJoinRoom(socket, {
      accessToken: 'valid-token',
      gameRoomId: 'room-001',
      userId: 'user-001',
    });

    await messageEvent;

    await expect(
      supportStateStore.getCurrentTurnState({
        gameRoomId: 'room-001',
      }),
    ).resolves.toEqual({
      currentTurnId: 'turn-001',
      currentTurnUserId: 'user-001',
    });

    socket.close();
  });

  it('fans out code-updated and stores the latest file content ephemerally', async () => {
    authService.validateAccessToken.mockImplementation(async (accessToken) => ({
      userId: accessToken === 'owner-token' ? 'user-001' : 'user-002',
    }));
    roomAccessService.getJoinRoomState.mockResolvedValue(createJoinRoomState());
    turnEditService.authorizeCodeChange.mockResolvedValue({
      isEditable: true,
      currentTurnId: 'turn-001',
      currentTurnUserId: 'user-001',
    });

    const ownerSocket = await connectClient(port);
    const watcherSocket = await connectClient(port);

    const ownerJoinMessage = waitForMessage(ownerSocket);
    sendJoinRoom(ownerSocket, {
      accessToken: 'owner-token',
      gameRoomId: 'room-001',
      userId: 'user-001',
    });
    await ownerJoinMessage;

    const watcherJoinMessage = waitForMessage(watcherSocket);
    sendJoinRoom(watcherSocket, {
      accessToken: 'watcher-token',
      gameRoomId: 'room-001',
      userId: 'user-002',
    });
    await watcherJoinMessage;

    const codeUpdatedMessage = waitForMessage(watcherSocket);
    sendCodeChange(ownerSocket, {
      gameRoomId: 'room-001',
      userId: 'forged-user-id',
      sessionId: 'session-001',
      filePath: 'main.py',
      content: 'print(\"hello\")\n',
      occurredAt: '2026-05-21T13:00:00+09:00',
    });

    await expect(codeUpdatedMessage).resolves.toEqual({
      event: 'code-updated',
      data: {
        gameRoomId: 'room-001',
        userId: 'user-001',
        filePath: 'main.py',
        content: 'print(\"hello\")\n',
        occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    });
    const latestFileContent = await supportStateStore.getLatestFileContent({
      gameRoomId: 'room-001',
      turnId: 'turn-001',
      filePath: 'main.py',
    });

    expect(latestFileContent).toMatchObject({
      gameRoomId: 'room-001',
      turnId: 'turn-001',
      userId: 'user-001',
      filePath: 'main.py',
      content: 'print(\"hello\")\n',
    });
    expect(latestFileContent?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await expect(
      supportStateStore.getCurrentTurnState({
        gameRoomId: 'room-001',
      }),
    ).resolves.toEqual({
      currentTurnId: 'turn-001',
      currentTurnUserId: 'user-001',
    });

    ownerSocket.close();
    watcherSocket.close();
  });

  it('ignores code-change when the socket user is not the current turn player', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-002' });
    roomAccessService.getJoinRoomState.mockResolvedValue(createJoinRoomState());
    turnEditService.authorizeCodeChange.mockResolvedValue({
      isEditable: false,
      currentTurnId: 'turn-001',
      currentTurnUserId: 'user-001',
    });

    const socket = await connectClient(port);
    const joinMessage = waitForMessage(socket);
    sendJoinRoom(socket, {
      accessToken: 'watcher-token',
      gameRoomId: 'room-001',
      userId: 'user-002',
    });
    await joinMessage;

    sendCodeChange(socket, {
      gameRoomId: 'room-001',
      userId: 'user-002',
      sessionId: 'session-002',
      filePath: 'main.py',
      content: 'print(\"forbidden\")\n',
      occurredAt: '2026-05-21T13:05:00+09:00',
    });

    await flushMicrotasks();

    await expect(
      supportStateStore.getLatestFileContent({
        gameRoomId: 'room-001',
        turnId: 'turn-001',
        filePath: 'main.py',
      }),
    ).resolves.toBeNull();
    await expect(
      supportStateStore.getCurrentTurnState({
        gameRoomId: 'room-001',
      }),
    ).resolves.toEqual({
      currentTurnId: 'turn-001',
      currentTurnUserId: 'user-001',
    });

    socket.close();
  });

  it('swallows code-change support-state failures without broadcasting corrupt state', async () => {
    authService.validateAccessToken.mockResolvedValue({ userId: 'user-001' });
    roomAccessService.getJoinRoomState.mockResolvedValue(createJoinRoomState());
    turnEditService.authorizeCodeChange.mockRejectedValue(new Error('turn lookup failed'));

    const ownerSocket = await connectClient(port);
    const watcherSocket = await connectClient(port);

    const ownerJoinMessage = waitForMessage(ownerSocket);
    sendJoinRoom(ownerSocket, {
      accessToken: 'owner-token',
      gameRoomId: 'room-001',
      userId: 'user-001',
    });
    await ownerJoinMessage;

    const watcherJoinMessage = waitForMessage(watcherSocket);
    sendJoinRoom(watcherSocket, {
      accessToken: 'watcher-token',
      gameRoomId: 'room-001',
      userId: 'user-002',
    });
    await watcherJoinMessage;

    sendCodeChange(ownerSocket, {
      gameRoomId: 'room-001',
      userId: 'user-001',
      sessionId: 'session-001',
      filePath: 'main.py',
      content: 'print(\"error\")\n',
      occurredAt: '2026-05-21T13:10:00+09:00',
    });

    await flushMicrotasks();

    await expect(
      supportStateStore.getCurrentTurnState({
        gameRoomId: 'room-001',
      }),
    ).resolves.toBeNull();
    await expect(
      supportStateStore.getLatestFileContent({
        gameRoomId: 'room-001',
        turnId: 'turn-001',
        filePath: 'main.py',
      }),
    ).resolves.toBeNull();

    ownerSocket.close();
    watcherSocket.close();
  });

  it('forwards turn-submit through the support hook with the latest buffered files', async () => {
    authService.validateAccessToken.mockImplementation(async (accessToken) => ({
      userId: accessToken === 'owner-token' ? 'user-001' : 'user-002',
    }));
    roomAccessService.getJoinRoomState.mockResolvedValue(createJoinRoomStateInProgress());
    turnEditService.authorizeCodeChange.mockResolvedValue({
      isEditable: true,
      currentTurnId: 'turn-001',
      currentTurnUserId: 'user-001',
    });
    turnSubmitService.submitTurn.mockResolvedValue({
      gameRoomId: 'room-001',
      turnId: 'turn-001',
      userId: 'user-001',
      occurredAt: '2026-05-22T11:00:00+09:00',
    });

    const ownerSocket = await connectClient(port);
    const watcherSocket = await connectClient(port);

    const ownerJoinMessage = waitForMessage(ownerSocket);
    sendJoinRoom(ownerSocket, {
      accessToken: 'owner-token',
      gameRoomId: 'room-001',
      userId: 'user-001',
    });
    await ownerJoinMessage;

    const watcherJoinMessage = waitForMessage(watcherSocket);
    sendJoinRoom(watcherSocket, {
      accessToken: 'watcher-token',
      gameRoomId: 'room-001',
      userId: 'user-002',
    });
    await watcherJoinMessage;

    sendCodeChange(ownerSocket, {
      gameRoomId: 'room-001',
      userId: 'user-001',
      sessionId: 'session-001',
      filePath: 'main.py',
      content: 'print(\"submit\")\n',
      occurredAt: '2026-05-22T10:59:00+09:00',
    });
    await waitForMessage(watcherSocket);

    const submitEvent = waitForMessage(watcherSocket);
    sendTurnSubmit(ownerSocket, {
      gameRoomId: 'room-001',
      occurredAt: '2026-05-22T11:00:00+09:00',
    });

    await expect(submitEvent).resolves.toEqual({
      event: 'turn-submit',
      data: {
        gameRoomId: 'room-001',
        turnId: 'turn-001',
        userId: 'user-001',
        occurredAt: '2026-05-22T11:00:00+09:00',
      },
    });
    expect(turnSubmitService.submitTurn).toHaveBeenCalledWith({
      gameRoomId: 'room-001',
      turnId: 'turn-001',
      userId: 'user-001',
      occurredAt: '2026-05-22T11:00:00+09:00',
      files: [
        expect.objectContaining({
          gameRoomId: 'room-001',
          turnId: 'turn-001',
          userId: 'user-001',
          filePath: 'main.py',
          content: 'print(\"submit\")\n',
        }),
      ],
    });

    ownerSocket.close();
    watcherSocket.close();
  });
});

async function connectClient(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return socket;
}

function sendJoinRoom(socket: WebSocket, payload: { accessToken: string; gameRoomId: string; userId: string }): void {
  socket.send(
    JSON.stringify({
      event: 'join-room',
      data: payload,
    }),
  );
}

function sendCodeChange(
  socket: WebSocket,
  payload: {
    gameRoomId: string;
    userId: string;
    sessionId: string;
    filePath: string;
    content: string;
    occurredAt: string;
  },
): void {
  socket.send(
    JSON.stringify({
      event: 'code-change',
      data: payload,
    }),
  );
}

function sendTurnSubmit(
  socket: WebSocket,
  payload: {
    gameRoomId: string;
    occurredAt: string;
  },
): void {
  socket.send(
    JSON.stringify({
      event: 'turn-submit',
      data: payload,
    }),
  );
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once('close', (code, reason) => {
      resolve({
        code,
        reason: reason.toString(),
      });
    });
  });
}

function waitForMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    socket.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

function createJoinRoomState(): RealtimeJoinRoomState {
  return {
    gameRoomId: 'room-001',
    initialState: {
      gameRoomId: 'room-001',
      participants: [
        {
          userId: 'user-001',
          nickname: 'owner',
          role: GameRoomParticipantRole.OWNER,
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
        },
      ],
      changedParticipant: null,
      gameState: {
        status: 'WAITING',
      },
      missionState: null,
      occurredAt: '2026-05-21T12:00:00+09:00',
    },
  };
}

function createJoinRoomStateInProgress(): RealtimeJoinRoomState {
  return {
    gameRoomId: 'room-001',
    initialState: {
      gameRoomId: 'room-001',
      participants: [
        {
          userId: 'user-001',
          nickname: 'owner',
          role: GameRoomParticipantRole.OWNER,
          membershipStatus: GameRoomParticipantMembershipStatus.JOINED,
        },
      ],
      changedParticipant: null,
      gameState: {
        status: 'IN_PROGRESS',
        turnState: {
          turnId: 'turn-001',
          currentPlayerId: 'user-001',
        },
      },
      missionState: null,
      occurredAt: '2026-05-21T12:05:00+09:00',
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
