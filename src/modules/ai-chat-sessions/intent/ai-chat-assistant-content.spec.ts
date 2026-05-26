import { AiChatRequestType } from '../../../shared/enums/ai-chat.enum';
import {
  buildCommandAssistantContent,
  buildSafeStaticFollowUpContent,
  DEFAULT_CLARIFICATION_MESSAGE,
  isUnsafeFollowUpContent,
  resolveClarificationAssistantContent,
  sanitizeFollowUpContent,
} from './ai-chat-assistant-content';

describe('ai-chat-assistant-content', () => {
  it('treats secret-like strings as unsafe', () => {
    expect(isUnsafeFollowUpContent('Bearer sk-live-abcdefghijklmnop')).toBe(true);
    expect(sanitizeFollowUpContent('Bearer sk-secret1234567890')).toBeNull();
  });

  it('ignores unsafe assistantHint and uses deterministic copy', () => {
    const result = buildCommandAssistantContent(
      { requestType: AiChatRequestType.GAME_START },
      'Bearer sk-secret1234567890 leaked',
    );
    expect(result.content).toBe('게임 시작 요청을 이해했어요.');
    expect(result.content).not.toContain('Bearer');
  });

  it('resolveClarificationAssistantContent falls back on unsafe hints', () => {
    expect(resolveClarificationAssistantContent('Bearer sk-secret1234567890')).toBe(
      DEFAULT_CLARIFICATION_MESSAGE,
    );
    expect(resolveClarificationAssistantContent('안내 문구')).toBe('안내 문구');
  });

  it('buildSafeStaticFollowUpContent never uses hints', () => {
    const result = buildSafeStaticFollowUpContent({
      requestType: AiChatRequestType.USER_INVITE,
      inviteeNicknames: ['player2'],
    });
    expect(result.content).toContain('player2');
  });
});
