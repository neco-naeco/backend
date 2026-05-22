import { AiChatRequestType } from '../enums/ai-chat.enum';

/** Mission difficulty values used in ROOM_CREATE command payloads (api-spec). */
export type MissionDifficulty = 'EASY' | 'NORMAL' | 'HARD';

/**
 * Internal command DTOs produced by AI intent parsing (Worker 1).
 * Stable contract for shared Task C3 room/participant integration.
 */
export interface RoomCreateCommandDto {
  requestType: AiChatRequestType.ROOM_CREATE;
  desiredDifficulty?: MissionDifficulty;
  desiredTopic?: string;
  missionTemplateId?: string;
  missionTemplateTitle?: string;
}

export interface UserInviteCommandDto {
  requestType: AiChatRequestType.USER_INVITE;
  gameRoomId?: string;
  inviteeNicknames: string[];
}

export interface RoomJoinCommandDto {
  requestType: AiChatRequestType.ROOM_JOIN;
  gameRoomId?: string;
  participantId?: string;
  roomTitle?: string;
}

export interface UserInviteDenyCommandDto {
  requestType: AiChatRequestType.USER_INVITE_DENY;
  gameRoomId?: string;
  participantId?: string;
}

export interface GameStartCommandDto {
  requestType: AiChatRequestType.GAME_START;
  gameRoomId?: string;
}

export type AiChatCommandDto =
  | RoomCreateCommandDto
  | UserInviteCommandDto
  | RoomJoinCommandDto
  | UserInviteDenyCommandDto
  | GameStartCommandDto;

export enum AiChatCommandResultStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/** API `commandResult` shape (docs/etc/api-spec.md §9). */
export interface AiChatCommandResultDto {
  commandType: AiChatRequestType;
  status: AiChatCommandResultStatus;
  apiPath: string | null;
  gameRoomId: string | null;
  participants: string[] | null;
  started: boolean | null;
}
