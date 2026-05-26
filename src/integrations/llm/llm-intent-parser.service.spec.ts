import { ConfigService } from '@nestjs/config';
import type { PromptTemplateService } from '../../modules/prompt-template/prompt-template.service';
import { LlmIntentParserService } from './llm-intent-parser.service';

describe('LlmIntentParserService', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'llm.apiKey') {
        return undefined;
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  const promptTemplateService = {
    renderTemplate: jest.fn(() => null),
    getActiveTemplate: jest.fn(() => null),
    refreshCache: jest.fn(),
  } as unknown as PromptTemplateService;

  let service: LlmIntentParserService;

  beforeEach(() => {
    service = new LlmIntentParserService(configService, promptTemplateService);
  });

  it('falls back to default intent system prompt when seed template is absent', () => {
    expect(service.resolveIntentSystemPrompt()).toContain('ROOM_CREATE');
  });

  it('heuristically parses ROOM_CREATE messages', async () => {
    const result = await service.parseUserMessage({ message: '쉬운 난이도로 방 만들어줘' });
    expect(result.requestType).toBe('ROOM_CREATE');
    expect(result.payload).toMatchObject({ desiredDifficulty: 'EASY' });
  });

  it('heuristically parses USER_INVITE messages', async () => {
    const result = await service.parseUserMessage({ message: '@코딩고수 초대해줘' });
    expect(result.requestType).toBe('USER_INVITE');
    expect(result.payload).toMatchObject({ inviteeNicknames: ['코딩고수'] });
  });

  it('parses invite acceptance as ROOM_JOIN before USER_INVITE', async () => {
    const result = await service.parseUserMessage({
      message: '문자열 핸들링 릴레이 방 초대 수락할게',
    });
    expect(result.requestType).toBe('ROOM_JOIN');
    expect(result.payload).toMatchObject({ roomTitle: '문자열 핸들링 릴레이' });
  });

  it('parses mission template selection as ROOM_CREATE in fallback', async () => {
    const result = await service.parseUserMessage({
      message: '기초 산술 연산 미션 선택할게',
    });
    expect(result.requestType).toBe('ROOM_CREATE');
    expect(result.payload).toMatchObject({ missionTemplateTitle: '기초 산술 연산' });
  });

  it('returns null requestType for unrecognized messages', async () => {
    const result = await service.parseUserMessage({ message: '오늘 날씨 어때?' });
    expect(result.requestType).toBeNull();
    expect(result.confidence).toBe('low');
  });
});
