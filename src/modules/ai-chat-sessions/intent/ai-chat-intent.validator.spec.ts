import { AiChatRequestType } from '../../../shared/enums/ai-chat.enum';
import { AI_CHAT_ERROR } from '../constants/ai-chat-error.constants';
import { DEFAULT_CLARIFICATION_MESSAGE } from './ai-chat-assistant-content';
import { AiChatIntentValidator } from './ai-chat-intent.validator';

describe('AiChatIntentValidator', () => {
  const validator = new AiChatIntentValidator();

  it('maps ROOM_CREATE with valid difficulty', () => {
    const result = validator.validate({
      requestType: 'ROOM_CREATE',
      payload: { desiredDifficulty: 'EASY', desiredTopic: 'arrays' },
    });

    expect(result).toEqual({
      outcome: 'command',
      command: {
        requestType: AiChatRequestType.ROOM_CREATE,
        desiredDifficulty: 'EASY',
        desiredTopic: 'arrays',
      },
      assistantHint: undefined,
    });
  });

  it('maps mission template selection through ROOM_CREATE', () => {
    const result = validator.validate({
      requestType: 'ROOM_CREATE',
      payload: { missionTemplateTitle: '기초 산술 연산' },
    });

    expect(result.outcome).toBe('command');
    if (result.outcome === 'command') {
      expect(result.command).toMatchObject({
        requestType: AiChatRequestType.ROOM_CREATE,
        missionTemplateTitle: '기초 산술 연산',
      });
    }
  });

  it('maps USER_INVITE with invitee nicknames', () => {
    const result = validator.validate({
      requestType: 'USER_INVITE',
      payload: { inviteeNicknames: ['코딩고수', '민수'] },
    });

    expect(result.outcome).toBe('command');
    if (result.outcome === 'command') {
      expect(result.command.requestType).toBe(AiChatRequestType.USER_INVITE);
      expect(result.command).toMatchObject({
        inviteeNicknames: ['코딩고수', '민수'],
      });
    }
  });

  it('returns clarification when USER_INVITE has no targets', () => {
    const result = validator.validate({
      requestType: 'USER_INVITE',
      payload: {},
    });

    expect(result).toEqual({
      outcome: 'clarification',
      content: '초대할 닉네임을 알려주세요. 예: @코딩고수 초대해줘',
    });
  });

  it('returns clarification for invalid ROOM_CREATE difficulty', () => {
    const result = validator.validate({
      requestType: 'ROOM_CREATE',
      payload: { desiredDifficulty: 'INSANE' },
    });

    expect(result.outcome).toBe('clarification');
  });

  it('returns clarification when requestType is null with safe assistantHint', () => {
    const result = validator.validate({
      requestType: null,
      assistantHint: '무엇을 도와드릴까요?',
    });

    expect(result).toEqual({
      outcome: 'clarification',
      content: '무엇을 도와드릴까요?',
    });
  });

  it('replaces unsafe assistantHint with default clarification when requestType is null', () => {
    const result = validator.validate({
      requestType: null,
      assistantHint: 'Bearer sk-secret1234567890 leaked',
    });

    expect(result).toEqual({
      outcome: 'clarification',
      content: DEFAULT_CLARIFICATION_MESSAGE,
    });
  });

  it('returns unsupported outcome for unknown intent type', () => {
    const result = validator.validate({ requestType: 'SEND_EMAIL', payload: {} });

    expect(result).toEqual({
      outcome: 'unsupported',
      content: '지원하지 않는 명령이에요: SEND_EMAIL',
      errorCode: AI_CHAT_ERROR.COMMAND_NOT_SUPPORTED,
      rawRequestType: 'SEND_EMAIL',
    });
  });
});
