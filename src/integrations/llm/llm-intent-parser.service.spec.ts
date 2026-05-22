import { ConfigService } from '@nestjs/config';
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

  let service: LlmIntentParserService;

  beforeEach(() => {
    service = new LlmIntentParserService(configService);
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
