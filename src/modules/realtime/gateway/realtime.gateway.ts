import {
  ForbiddenException,
  Inject,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import { toSeoulIso } from '../../../common';
import {
  REALTIME_AUTH_SERVICE,
  REALTIME_CLOSE_CODE,
  REALTIME_CLOSE_REASON,
  REALTIME_DISCONNECT_SERVICE,
  REALTIME_EVENT,
  REALTIME_ROOM_ACCESS_SERVICE,
  REALTIME_SUPPORT_STATE_STORE,
  REALTIME_TURN_EDIT_SERVICE,
  REALTIME_TURN_SUBMIT_SERVICE,
} from '../service/realtime.constants';
import {
  CodeChangePayload,
  CodeUpdatedEvent,
  GameStateUpdatedEvent,
  JoinRoomPayload,
  MissionResultEvent,
  RealtimeAuthService,
  RealtimeDisconnectService,
  RealtimeRoomAccessService,
  RealtimeSupportStateStore,
  RealtimeFileContentBuffer,
  RealtimeTurnSubmitService,
  RealtimeTurnEditService,
  RoomParticipantsUpdatedEvent,
  TurnChangedEvent,
  TurnEvaluatedEvent,
  TurnSubmitEvent,
  TurnSubmitPayload,
} from '../service/realtime.interfaces';

interface SocketSession {
  gameRoomId: string;
  userId: string;
}

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly roomSessions = new Map<string, Set<WebSocket>>();
  private readonly roomUserSessions = new Map<string, Map<string, Set<WebSocket>>>();
  private readonly socketSessions = new WeakMap<WebSocket, SocketSession>();

  constructor(
    @Inject(REALTIME_AUTH_SERVICE)
    private readonly authService: RealtimeAuthService,
    @Inject(REALTIME_ROOM_ACCESS_SERVICE)
    private readonly roomAccessService: RealtimeRoomAccessService,
    @Inject(REALTIME_DISCONNECT_SERVICE)
    private readonly disconnectService: RealtimeDisconnectService,
    @Inject(REALTIME_TURN_EDIT_SERVICE)
    private readonly turnEditService: RealtimeTurnEditService,
    @Inject(REALTIME_TURN_SUBMIT_SERVICE)
    private readonly turnSubmitService: RealtimeTurnSubmitService,
    @Inject(REALTIME_SUPPORT_STATE_STORE)
    private readonly supportStateStore: RealtimeSupportStateStore,
  ) {}

  @SubscribeMessage(REALTIME_EVENT.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<void> {
    if (!this.hasText(payload?.accessToken)) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.AUTH_TOKEN_INVALID,
        REALTIME_CLOSE_REASON.AUTH_TOKEN_INVALID,
      );
      return;
    }

    if (!this.hasText(payload.gameRoomId)) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.GAME_ROOM_NOT_FOUND,
        REALTIME_CLOSE_REASON.GAME_ROOM_NOT_FOUND,
      );
      return;
    }

    try {
      const authenticatedUser = await this.authService.validateAccessToken(payload.accessToken);
      const joinRoomState = await this.roomAccessService.getJoinRoomState({
        gameRoomId: payload.gameRoomId,
        userId: authenticatedUser.userId,
      });

      this.bindSocketToRoom(client, {
        gameRoomId: joinRoomState.gameRoomId,
        userId: authenticatedUser.userId,
      });
      await this.syncCurrentTurnStateFromGameState(
        joinRoomState.gameRoomId,
        joinRoomState.initialState.gameState,
      );
      this.sendEvent(client, REALTIME_EVENT.ROOM_PARTICIPANTS_UPDATED, joinRoomState.initialState);
    } catch (error) {
      this.handleJoinError(client, error);
    }
  }

  @SubscribeMessage(REALTIME_EVENT.CODE_CHANGE)
  async handleCodeChange(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: CodeChangePayload,
  ): Promise<void> {
    const session = this.socketSessions.get(client);

    if (!session || !this.isValidCodeChangePayload(payload) || payload.gameRoomId !== session.gameRoomId) {
      return;
    }

    try {
      const authorization = await this.turnEditService.authorizeCodeChange({
        gameRoomId: session.gameRoomId,
        userId: session.userId,
      });

      await this.supportStateStore.saveCurrentTurnState({
        gameRoomId: session.gameRoomId,
        currentTurnId: authorization.currentTurnId,
        currentTurnUserId: authorization.currentTurnUserId,
      });

      if (!authorization.isEditable || !this.hasText(authorization.currentTurnId)) {
        return;
      }

      const occurredAt = toSeoulIso(new Date());
      const codeUpdatedEvent: CodeUpdatedEvent = {
        gameRoomId: session.gameRoomId,
        userId: session.userId,
        filePath: payload.filePath,
        content: payload.content,
        occurredAt,
      };

      await this.supportStateStore.saveLatestFileContent({
        ...codeUpdatedEvent,
        turnId: authorization.currentTurnId,
      });
      this.broadcastToRoom(session.gameRoomId, REALTIME_EVENT.CODE_UPDATED, codeUpdatedEvent, client);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown code-change error';
      this.logger.warn(`Failed to process code-change: ${message}`);
    }
  }

  @SubscribeMessage(REALTIME_EVENT.TURN_SUBMIT)
  async handleTurnSubmit(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: TurnSubmitPayload,
  ): Promise<void> {
    const session = this.socketSessions.get(client);

    if (!session || !this.isValidTurnSubmitPayload(payload) || payload.gameRoomId !== session.gameRoomId) {
      return;
    }

    try {
      const currentTurnState = await this.supportStateStore.getCurrentTurnState({
        gameRoomId: session.gameRoomId,
      });

      if (!currentTurnState?.currentTurnId || currentTurnState.currentTurnUserId !== session.userId) {
        return;
      }

      const turnSubmitEvent = await this.turnSubmitService.submitTurn({
        gameRoomId: session.gameRoomId,
        turnId: currentTurnState.currentTurnId,
        userId: session.userId,
        occurredAt: payload.occurredAt ?? toSeoulIso(new Date()),
        files: await this.collectTurnSubmitFiles(
          payload,
          session.gameRoomId,
          currentTurnState.currentTurnId,
          session.userId,
        ),
      });

      if (!turnSubmitEvent) {
        return;
      }

      this.emitToRoom(session.gameRoomId, REALTIME_EVENT.TURN_SUBMIT, turnSubmitEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown turn-submit error';
      this.logger.warn(`Failed to process turn-submit: ${message}`);
    }
  }

  async handleDisconnect(client: WebSocket): Promise<void> {
    const session = this.socketSessions.get(client);

    if (!session) {
      return;
    }

    const hasRemainingUserSockets = this.unbindSocketFromRoom(
      client,
      session.gameRoomId,
      session.userId,
    );
    this.socketSessions.delete(client);

    if (hasRemainingUserSockets) {
      return;
    }

    try {
      await this.disconnectService.handleDisconnect({
        gameRoomId: session.gameRoomId,
        userId: session.userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown disconnect error';
      this.logger.warn(`Failed to process disconnect cleanup: ${message}`);
    }
  }

  private bindSocketToRoom(client: WebSocket, session: SocketSession): void {
    const currentSession = this.socketSessions.get(client);

    if (currentSession) {
      this.unbindSocketFromRoom(client, currentSession.gameRoomId, currentSession.userId);
    }

    const roomSockets = this.roomSessions.get(session.gameRoomId) ?? new Set<WebSocket>();
    roomSockets.add(client);
    this.roomSessions.set(session.gameRoomId, roomSockets);

    const roomUsers = this.roomUserSessions.get(session.gameRoomId) ?? new Map<string, Set<WebSocket>>();
    const userSockets = roomUsers.get(session.userId) ?? new Set<WebSocket>();
    userSockets.add(client);
    roomUsers.set(session.userId, userSockets);
    this.roomUserSessions.set(session.gameRoomId, roomUsers);
    this.socketSessions.set(client, session);
  }

  private unbindSocketFromRoom(client: WebSocket, gameRoomId: string, userId: string): boolean {
    const roomSockets = this.roomSessions.get(gameRoomId);

    if (roomSockets) {
      roomSockets.delete(client);
      if (roomSockets.size === 0) {
        this.roomSessions.delete(gameRoomId);
      }
    }

    const roomUsers = this.roomUserSessions.get(gameRoomId);

    if (!roomUsers) {
      return false;
    }

    const userSockets = roomUsers.get(userId);

    if (!userSockets) {
      return false;
    }

    userSockets.delete(client);

    if (userSockets.size > 0) {
      return true;
    }

    roomUsers.delete(userId);
    if (roomUsers.size === 0) {
      this.roomUserSessions.delete(gameRoomId);
    }

    return false;
  }

  public emitToRoom(
    gameRoomId: string,
    event: string,
    data:
      | RoomParticipantsUpdatedEvent
      | CodeUpdatedEvent
      | TurnSubmitEvent
      | TurnEvaluatedEvent
      | TurnChangedEvent
      | GameStateUpdatedEvent
      | MissionResultEvent,
    excludedClient?: WebSocket,
  ): void {
    this.broadcastToRoom(gameRoomId, event, data, excludedClient);
  }

  private sendEvent(
    client: WebSocket,
    event: string,
    data:
      | RoomParticipantsUpdatedEvent
      | CodeUpdatedEvent
      | TurnSubmitEvent
      | TurnEvaluatedEvent
      | TurnChangedEvent
      | GameStateUpdatedEvent
      | MissionResultEvent,
  ): void {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    client.send(
      JSON.stringify({
        event,
        data,
      }),
    );
  }

  private broadcastToRoom(
    gameRoomId: string,
    event: string,
    data:
      | CodeUpdatedEvent
      | TurnSubmitEvent
      | TurnEvaluatedEvent
      | TurnChangedEvent
      | GameStateUpdatedEvent
      | MissionResultEvent,
    excludedClient?: WebSocket,
  ): void {
    const roomSockets = this.roomSessions.get(gameRoomId);

    if (!roomSockets) {
      return;
    }

    for (const roomSocket of roomSockets) {
      if (roomSocket === excludedClient) {
        continue;
      }

      this.sendEvent(roomSocket, event, data);
    }
  }

  private handleJoinError(client: WebSocket, error: unknown): void {
    if (error instanceof UnauthorizedException) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.AUTH_TOKEN_INVALID,
        REALTIME_CLOSE_REASON.AUTH_TOKEN_INVALID,
      );
      return;
    }

    if (error instanceof ForbiddenException) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.FORBIDDEN_RESOURCE_ACCESS,
        REALTIME_CLOSE_REASON.FORBIDDEN_RESOURCE_ACCESS,
      );
      return;
    }

    if (error instanceof NotFoundException) {
      this.closeSocket(
        client,
        REALTIME_CLOSE_CODE.GAME_ROOM_NOT_FOUND,
        REALTIME_CLOSE_REASON.GAME_ROOM_NOT_FOUND,
      );
      return;
    }

    const message = error instanceof Error ? error.message : 'unknown realtime error';
    this.logger.error(`Unexpected join-room failure: ${message}`);
    this.closeSocket(client, REALTIME_CLOSE_CODE.NORMAL_CLOSURE);
  }

  private closeSocket(client: WebSocket, code: number, reason?: string): void {
    if (client.readyState === WebSocket.CLOSING || client.readyState === WebSocket.CLOSED) {
      return;
    }

    client.close(code, reason);
  }

  private hasText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isValidCodeChangePayload(payload: CodeChangePayload | undefined): payload is CodeChangePayload {
    return (
      this.hasText(payload?.gameRoomId) &&
      this.hasText(payload.filePath) &&
      typeof payload.content === 'string'
    );
  }

  private isValidTurnSubmitPayload(payload: TurnSubmitPayload | undefined): payload is TurnSubmitPayload {
    if (!this.hasText(payload?.gameRoomId)) {
      return false;
    }

    if (payload.files === undefined) {
      return true;
    }

    if (!Array.isArray(payload.files)) {
      return false;
    }

    return payload.files.every(
      (file) => this.hasText(file.filePath) && typeof file.content === 'string',
    );
  }

  private async collectTurnSubmitFiles(
    payload: TurnSubmitPayload,
    gameRoomId: string,
    turnId: string,
    userId: string,
  ): Promise<RealtimeFileContentBuffer[]> {
    const bufferedFiles = await this.supportStateStore.listLatestFileContents({
      gameRoomId,
      turnId,
    });
    const filesByPath = new Map(
      bufferedFiles.map((file) => [file.filePath, file] as const),
    );

    for (const file of payload.files ?? []) {
      filesByPath.set(file.filePath, {
        gameRoomId,
        turnId,
        userId,
        filePath: file.filePath,
        content: file.content,
        occurredAt: payload.occurredAt ?? toSeoulIso(new Date()),
      });
    }

    return Array.from(filesByPath.values());
  }

  private async syncCurrentTurnStateFromGameState(
    gameRoomId: string,
    gameState: Record<string, unknown>,
  ): Promise<void> {
    const turnState = this.extractTurnState(gameState);

    if (!turnState) {
      return;
    }

    await this.supportStateStore.saveCurrentTurnState({
      gameRoomId,
      currentTurnId: turnState.turnId,
      currentTurnUserId: turnState.currentPlayerId,
    });
  }

  private extractTurnState(gameState: Record<string, unknown>): {
    turnId: string;
    currentPlayerId: string;
  } | null {
    const turnState = gameState.turnState;

    if (!turnState || typeof turnState !== 'object') {
      return null;
    }

    const maybeTurnId = (turnState as Record<string, unknown>).turnId;
    const maybeCurrentPlayerId = (turnState as Record<string, unknown>).currentPlayerId;

    if (!this.hasText(maybeTurnId) || !this.hasText(maybeCurrentPlayerId)) {
      return null;
    }

    return {
      turnId: maybeTurnId,
      currentPlayerId: maybeCurrentPlayerId,
    };
  }
}
