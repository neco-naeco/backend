import {
  AiRealtimeEventType,
  GameRoomParticipantMembershipStatus,
  GameRoomParticipantRole,
} from '../../../shared/enums';

export interface JoinRoomPayload {
  accessToken: string;
  gameRoomId: string;
  userId?: string;
}

export interface CodeChangePayload {
  gameRoomId: string;
  userId?: string;
  sessionId?: string;
  filePath: string;
  content: string;
  occurredAt?: string;
}

export interface TurnSubmitPayload {
  gameRoomId: string;
  occurredAt?: string;
  files?: TurnSubmitFilePayload[];
}

export interface TurnSubmitFilePayload {
  filePath: string;
  content: string;
}

export interface RealtimeAuthenticatedUser {
  userId: string;
}

export interface RoomParticipantView {
  userId: string;
  nickname: string;
  role: GameRoomParticipantRole;
  membershipStatus: GameRoomParticipantMembershipStatus;
}

export interface RoomParticipantsUpdatedEvent {
  gameRoomId: string;
  participants: RoomParticipantView[];
  changedParticipant: RoomParticipantView | null;
  gameState: Record<string, unknown>;
  missionState: Record<string, unknown> | null;
  occurredAt: string;
}

export interface RealtimeJoinRoomState {
  gameRoomId: string;
  initialState: RoomParticipantsUpdatedEvent;
}

export interface CodeUpdatedEvent {
  gameRoomId: string;
  userId: string;
  filePath: string;
  content: string;
  occurredAt: string;
}

export interface RealtimeTurnEditAuthorization {
  isEditable: boolean;
  currentTurnId: string | null;
  currentTurnUserId: string | null;
}

export interface RealtimeFileContentBuffer {
  gameRoomId: string;
  turnId: string;
  userId: string;
  filePath: string;
  content: string;
  occurredAt: string;
}

export interface RealtimeCurrentTurnState {
  currentTurnId: string | null;
  currentTurnUserId: string | null;
}

export interface RealtimeAssistiveNotice {
  type: AiRealtimeEventType;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface TurnSubmitEvent {
  gameRoomId: string;
  turnId: string;
  userId: string;
  occurredAt: string;
}

export interface GameStartedEvent {
  gameRoomId: string;
  gameState: Record<string, unknown>;
  missionState: Record<string, unknown>;
  uiHints: Record<string, unknown>;
  occurredAt: string;
}

export interface TurnEvaluatedEvent {
  gameRoomId: string;
  evaluatedTurn: Record<string, unknown>;
  evaluationResult: Record<string, unknown>;
  occurredAt: string;
  aiNotice?: RealtimeAssistiveNotice | null;
}

export interface TurnChangedEvent {
  gameRoomId: string;
  previousTurnId: string | null;
  currentTurnId: string | null;
  currentTurnUserId: string | null;
  missionState?: Record<string, unknown> | null;
  turnState?: Record<string, unknown> | null;
  nextPlayerId?: string | null;
  turnSnapshotId?: string | null;
  occurredAt: string;
}

export interface GameStateUpdatedEvent {
  gameRoomId: string;
  gameState: Record<string, unknown>;
  missionState?: Record<string, unknown> | null;
  occurredAt: string;
  aiNotice?: RealtimeAssistiveNotice | null;
}

export interface MissionResultEvent {
  gameRoomId: string;
  gameState?: Record<string, unknown>;
  missionResult: Record<string, unknown>;
  occurredAt: string;
  aiNotice?: RealtimeAssistiveNotice | null;
}

export interface RealtimeTurnSubmitRequest {
  gameRoomId: string;
  turnId: string;
  userId: string;
  occurredAt: string;
  files: RealtimeFileContentBuffer[];
}

export interface RealtimeAssistiveMessageRequest {
  event: string;
  gameRoomId: string;
  turnId?: string | null;
  missionId?: string | null;
  userId?: string | null;
  payload: Record<string, unknown>;
}

export interface RealtimeAuthService {
  validateAccessToken(accessToken: string): Promise<RealtimeAuthenticatedUser>;
}

export interface RealtimeRoomAccessService {
  getJoinRoomState(input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeJoinRoomState>;
}

export interface RealtimeDisconnectService {
  handleDisconnect(input: { gameRoomId: string; userId: string }): Promise<void>;
}

export interface RealtimeTurnEditService {
  authorizeCodeChange(input: {
    gameRoomId: string;
    userId: string;
  }): Promise<RealtimeTurnEditAuthorization>;
}

export interface RealtimeTurnSubmitService {
  submitTurn(input: RealtimeTurnSubmitRequest): Promise<void>;
}

export interface RealtimeAssistiveMessageService {
  buildNotice(
    input: RealtimeAssistiveMessageRequest,
  ): Promise<RealtimeAssistiveNotice | null>;
}

export interface RealtimeSupportStateStore {
  saveCurrentTurnState(input: {
    gameRoomId: string;
    currentTurnId: string | null;
    currentTurnUserId: string | null;
  }): Promise<void>;
  getCurrentTurnState(input: { gameRoomId: string }): Promise<RealtimeCurrentTurnState | null>;
  saveLatestFileContent(buffer: RealtimeFileContentBuffer): Promise<void>;
  getLatestFileContent(input: {
    gameRoomId: string;
    turnId: string;
    filePath: string;
  }): Promise<RealtimeFileContentBuffer | null>;
  listLatestFileContents(input: {
    gameRoomId: string;
    turnId: string;
  }): Promise<RealtimeFileContentBuffer[]>;
  clearLatestFileContents(input: { gameRoomId: string; turnId: string }): Promise<void>;
}
