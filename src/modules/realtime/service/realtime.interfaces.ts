import {
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
  clearLatestFileContents(input: { gameRoomId: string; turnId: string }): Promise<void>;
}
