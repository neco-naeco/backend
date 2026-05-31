import { AiChatRequestType } from '../../../shared/enums/ai-chat.enum';
import type {
  AiChatCommandDto,
  AiChatCommandResultDto,
} from '../../../shared/dto/ai-chat-command.dto';
import { AiChatCommandResultStatus } from '../../../shared/dto/ai-chat-command.dto';

/**
 * Maps validated internal command DTOs to API commandResult (W1-3: PENDING only; no downstream execution).
 */
export class AiChatCommandResultMapper {
  toPendingResult(command: AiChatCommandDto): AiChatCommandResultDto {
    return {
      commandType: command.requestType,
      status: AiChatCommandResultStatus.PENDING,
      apiPath: this.resolveApiPath(command),
      gameRoomId: this.resolveGameRoomId(command),
      title: null,
      participants: null,
      started: command.requestType === AiChatRequestType.GAME_START ? false : null,
    };
  }

  toSuccessResult(
    command: AiChatCommandDto,
    details: {
      apiPath?: string | null;
      gameRoomId?: string | null;
      title?: string | null;
      participants?: string[] | null;
      started?: boolean | null;
    },
  ): AiChatCommandResultDto {
    return {
      commandType: command.requestType,
      status: AiChatCommandResultStatus.SUCCESS,
      apiPath: details.apiPath ?? this.resolveApiPath(command),
      gameRoomId: details.gameRoomId ?? this.resolveGameRoomId(command),
      title: details.title ?? null,
      participants: details.participants ?? null,
      started:
        details.started ??
        (command.requestType === AiChatRequestType.GAME_START ? true : null),
    };
  }

  toFailedResult(
    commandOrRequestType: AiChatCommandDto | AiChatRequestType,
    details?: {
      apiPath?: string | null;
      gameRoomId?: string | null;
      title?: string | null;
      participants?: string[] | null;
      started?: boolean | null;
    },
  ): AiChatCommandResultDto {
    const command =
      typeof commandOrRequestType === 'string'
        ? null
        : commandOrRequestType;
    const requestType =
      typeof commandOrRequestType === 'string'
        ? commandOrRequestType
        : commandOrRequestType.requestType;

    return {
      commandType: requestType,
      status: AiChatCommandResultStatus.FAILED,
      apiPath: details?.apiPath ?? (command ? this.resolveApiPath(command) : null),
      gameRoomId:
        details?.gameRoomId ??
        (command ? this.resolveGameRoomId(command) : null),
      title: details?.title ?? null,
      participants: details?.participants ?? null,
      started:
        details?.started ??
        (requestType === AiChatRequestType.GAME_START ? false : null),
    };
  }

  private resolveGameRoomId(command: AiChatCommandDto): string | null {
    if (command.requestType === AiChatRequestType.ROOM_CREATE) {
      return null;
    }
    return command.gameRoomId ?? null;
  }

  private resolveApiPath(command: AiChatCommandDto): string | null {
    switch (command.requestType) {
      case AiChatRequestType.ROOM_CREATE:
        return '/v1/game-rooms';
      case AiChatRequestType.USER_INVITE:
        return command.gameRoomId
          ? `/v1/game-rooms/${command.gameRoomId}/invite`
          : '/v1/game-rooms/{gameRoomId}/invite';
      case AiChatRequestType.ROOM_JOIN:
        return command.participantId
          ? `/v1/game-room-participants/${command.participantId}/join`
          : '/v1/game-room-participants/{participantId}/join';
      case AiChatRequestType.USER_INVITE_DENY:
        return command.participantId
          ? `/v1/game-room-participants/${command.participantId}/deny`
          : '/v1/game-room-participants/{participantId}/deny';
      case AiChatRequestType.GAME_START:
        return command.gameRoomId
          ? `/v1/game-rooms/${command.gameRoomId}/start`
          : '/v1/game-rooms/{gameRoomId}/start';
      default:
        return null;
    }
  }
}
