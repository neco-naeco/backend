import { AiChatRequestType } from '../../../shared/enums/ai-chat.enum';
import type {
  AiChatCommandDto,
  GameStartCommandDto,
  MissionDifficulty,
  RoomCreateCommandDto,
  RoomJoinCommandDto,
  UserInviteCommandDto,
  UserInviteDenyCommandDto,
} from '../../../shared/dto/ai-chat-command.dto';
import type { LlmIntentRawResponse } from '../../../integrations/llm/llm-intent-parser.port';
import { AI_CHAT_ERROR } from '../constants/ai-chat-error.constants';
import { resolveClarificationAssistantContent } from './ai-chat-assistant-content';

const SUPPORTED_TYPES = new Set<string>(Object.values(AiChatRequestType));
const DIFFICULTIES = new Set<MissionDifficulty>(['EASY', 'NORMAL', 'HARD']);

export type IntentValidationSuccess = {
  outcome: 'command';
  command: AiChatCommandDto;
  assistantHint?: string;
};

export type IntentValidationClarification = {
  outcome: 'clarification';
  content: string;
};

export type IntentValidationUnsupported = {
  outcome: 'unsupported';
  content: string;
  errorCode: typeof AI_CHAT_ERROR.COMMAND_NOT_SUPPORTED;
  rawRequestType: string;
};

export type IntentValidationResult =
  | IntentValidationSuccess
  | IntentValidationClarification
  | IntentValidationUnsupported;

export class AiChatIntentValidator {
  validate(raw: LlmIntentRawResponse): IntentValidationResult {
    if (!raw.requestType) {
      return {
        outcome: 'clarification',
        content: resolveClarificationAssistantContent(raw.assistantHint),
      };
    }

    if (!SUPPORTED_TYPES.has(raw.requestType)) {
      return {
        outcome: 'unsupported',
        content: `지원하지 않는 명령이에요: ${raw.requestType}`,
        errorCode: AI_CHAT_ERROR.COMMAND_NOT_SUPPORTED,
        rawRequestType: raw.requestType,
      };
    }

    const payload = raw.payload ?? {};
    const requestType = raw.requestType as AiChatRequestType;

    switch (requestType) {
      case AiChatRequestType.ROOM_CREATE:
        return this.validateRoomCreate(payload, raw.assistantHint);
      case AiChatRequestType.USER_INVITE:
        return this.validateUserInvite(payload, raw.assistantHint);
      case AiChatRequestType.ROOM_JOIN:
        return this.validateRoomJoin(payload, raw.assistantHint);
      case AiChatRequestType.USER_INVITE_DENY:
        return this.validateUserInviteDeny(payload, raw.assistantHint);
      case AiChatRequestType.GAME_START:
        return this.validateGameStart(payload, raw.assistantHint);
      default:
        return {
          outcome: 'unsupported',
          content: `지원하지 않는 명령이에요: ${raw.requestType}`,
          errorCode: AI_CHAT_ERROR.COMMAND_NOT_SUPPORTED,
          rawRequestType: raw.requestType,
        };
    }
  }

  private validateRoomCreate(
    payload: Record<string, unknown>,
    assistantHint?: string,
  ): IntentValidationResult {
    const desiredDifficulty = this.readDifficulty(payload.desiredDifficulty);
    if (payload.desiredDifficulty !== undefined && desiredDifficulty === undefined) {
      return {
        outcome: 'clarification',
        content: '난이도는 EASY, NORMAL, HARD 중 하나로 알려주세요.',
      };
    }

    const command: RoomCreateCommandDto = {
      requestType: AiChatRequestType.ROOM_CREATE,
      ...(desiredDifficulty ? { desiredDifficulty } : {}),
      ...(this.readOptionalString(payload.desiredTopic)
        ? { desiredTopic: this.readOptionalString(payload.desiredTopic) }
        : {}),
      ...(this.readOptionalString(payload.missionTemplateId)
        ? { missionTemplateId: this.readOptionalString(payload.missionTemplateId) }
        : {}),
      ...(this.readOptionalString(payload.missionTemplateTitle)
        ? { missionTemplateTitle: this.readOptionalString(payload.missionTemplateTitle) }
        : {}),
    };

    return { outcome: 'command', command, assistantHint };
  }

  private validateUserInvite(
    payload: Record<string, unknown>,
    assistantHint?: string,
  ): IntentValidationResult {
    const inviteeNicknames = this.readStringArray(payload.inviteeNicknames);
    if (!inviteeNicknames || inviteeNicknames.length === 0) {
      return {
        outcome: 'clarification',
        content: '초대할 닉네임을 알려주세요. 예: @코딩고수 초대해줘',
      };
    }

    const command: UserInviteCommandDto = {
      requestType: AiChatRequestType.USER_INVITE,
      inviteeNicknames,
      ...(this.readOptionalString(payload.gameRoomId)
        ? { gameRoomId: this.readOptionalString(payload.gameRoomId) }
        : {}),
    };

    return { outcome: 'command', command, assistantHint };
  }

  private validateRoomJoin(
    payload: Record<string, unknown>,
    assistantHint?: string,
  ): IntentValidationResult {
    const command: RoomJoinCommandDto = {
      requestType: AiChatRequestType.ROOM_JOIN,
      ...(this.readOptionalString(payload.gameRoomId)
        ? { gameRoomId: this.readOptionalString(payload.gameRoomId) }
        : {}),
      ...(this.readOptionalString(payload.participantId)
        ? { participantId: this.readOptionalString(payload.participantId) }
        : {}),
      ...(this.readOptionalString(payload.roomTitle)
        ? { roomTitle: this.readOptionalString(payload.roomTitle) }
        : {}),
    };

    return { outcome: 'command', command, assistantHint };
  }

  private validateUserInviteDeny(
    payload: Record<string, unknown>,
    assistantHint?: string,
  ): IntentValidationResult {
    const command: UserInviteDenyCommandDto = {
      requestType: AiChatRequestType.USER_INVITE_DENY,
      ...(this.readOptionalString(payload.gameRoomId)
        ? { gameRoomId: this.readOptionalString(payload.gameRoomId) }
        : {}),
      ...(this.readOptionalString(payload.participantId)
        ? { participantId: this.readOptionalString(payload.participantId) }
        : {}),
    };

    return { outcome: 'command', command, assistantHint };
  }

  private validateGameStart(
    payload: Record<string, unknown>,
    assistantHint?: string,
  ): IntentValidationResult {
    const command: GameStartCommandDto = {
      requestType: AiChatRequestType.GAME_START,
      ...(this.readOptionalString(payload.gameRoomId)
        ? { gameRoomId: this.readOptionalString(payload.gameRoomId) }
        : {}),
    };

    return { outcome: 'command', command, assistantHint };
  }

  private readDifficulty(value: unknown): MissionDifficulty | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const upper = value.toUpperCase() as MissionDifficulty;
    return DIFFICULTIES.has(upper) ? upper : undefined;
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return items;
  }
}
