import { AiChatRequestType } from '../../../shared/enums/ai-chat.enum';
import type { AiChatCommandDto } from '../../../shared/dto/ai-chat-command.dto';

export function buildCommandAssistantContent(
  command: AiChatCommandDto,
  hint?: string,
): { content: string; metadata: Record<string, unknown> | null } {
  if (hint) {
    return { content: hint, metadata: { parsedCommandType: command.requestType } };
  }

  switch (command.requestType) {
    case AiChatRequestType.ROOM_CREATE:
      return {
        content: command.desiredDifficulty
          ? `${command.desiredDifficulty} 난이도로 방을 만들 준비가 됐어요. 미션을 선택해 주세요.`
          : '방을 만들 수 있어요. 원하는 난이도를 알려주세요.',
        metadata: {
          ...(command.desiredDifficulty ? { difficulty: command.desiredDifficulty } : {}),
          ...(command.missionTemplateTitle
            ? { missionTemplateTitle: command.missionTemplateTitle }
            : {}),
          ...(command.missionTemplateId ? { missionTemplateId: command.missionTemplateId } : {}),
        },
      };
    case AiChatRequestType.USER_INVITE:
      return {
        content: `${command.inviteeNicknames.join(', ')} 님을 초대할게요.`,
        metadata: { inviteeNicknames: command.inviteeNicknames },
      };
    case AiChatRequestType.ROOM_JOIN:
      return {
        content: '방 참가 요청을 이해했어요.',
        metadata: {
          ...(command.roomTitle ? { roomTitle: command.roomTitle } : {}),
          ...(command.gameRoomId ? { gameRoomId: command.gameRoomId } : {}),
        },
      };
    case AiChatRequestType.USER_INVITE_DENY:
      return {
        content: '초대 거절 요청을 이해했어요.',
        metadata: command.gameRoomId ? { gameRoomId: command.gameRoomId } : null,
      };
    case AiChatRequestType.GAME_START:
      return {
        content: '게임 시작 요청을 이해했어요.',
        metadata: command.gameRoomId ? { gameRoomId: command.gameRoomId } : null,
      };
    default:
      return { content: '요청을 처리할 준비가 됐어요.', metadata: null };
  }
}

export const CLARIFICATION_ASSISTANT_PREFIX = '명령을 완전히 이해하지 못했어요.';
