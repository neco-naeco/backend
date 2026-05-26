import { HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import {
  AiChatMessageSenderType,
  AiChatMessageType,
  AiChatRequestStatus,
  AiChatRequestType,
} from '../../shared/enums/ai-chat.enum';
import { AiChatCommandResultStatus } from '../../shared/dto/ai-chat-command.dto';
import type { LlmFollowUpGeneratorPort } from '../../integrations/llm/llm-follow-up.port';
import type { LlmIntentParserPort } from '../../integrations/llm/llm-intent-parser.port';
import { DEFAULT_CLARIFICATION_MESSAGE } from './intent/ai-chat-assistant-content';
import { AI_CHAT_ERROR } from './constants/ai-chat-error.constants';
import { AiChatSessionsService } from './ai-chat-sessions.service';
import { AiChatMessage } from './entity/ai-chat-message.entity';
import { AiChatRequest } from './entity/ai-chat-request.entity';
import { AiChatSession } from './entity/ai-chat-session.entity';

describe('AiChatSessionsService', () => {
  const user = { userId: 'user-1', loginId: 'player1' };
  const sessionId = 'session-1';

  let aiChatSessionRepository: jest.Mocked<Repository<AiChatSession>>;
  let aiChatMessageRepository: jest.Mocked<Repository<AiChatMessage>>;
  let aiChatRequestRepository: jest.Mocked<Repository<AiChatRequest>>;
  let dataSource: jest.Mocked<DataSource>;
  let llmIntentParser: jest.Mocked<LlmIntentParserPort>;
  let llmFollowUpGenerator: jest.Mocked<LlmFollowUpGeneratorPort>;
  let service: AiChatSessionsService;

  beforeEach(() => {
    aiChatSessionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<AiChatSession>>;

    aiChatMessageRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<AiChatMessage>>;

    aiChatRequestRepository = {} as unknown as jest.Mocked<Repository<AiChatRequest>>;

    dataSource = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    llmIntentParser = {
      parseUserMessage: jest.fn(),
    };

    llmFollowUpGenerator = {
      generateCommandFollowUp: jest.fn().mockResolvedValue({
        content: 'EASY 난이도로 방을 만들 준비가 됐어요. 미션을 선택해 주세요.',
        metadata: { difficulty: 'EASY', followUpSource: 'static_fallback', templateKey: null },
        followUpSource: 'static_fallback',
        templateKey: null,
      }),
    };

    service = new AiChatSessionsService(
      aiChatSessionRepository,
      aiChatMessageRepository,
      aiChatRequestRepository,
      dataSource,
      llmIntentParser,
      llmFollowUpGenerator,
    );
  });

  function mockTransactions() {
    const requestRepo = {
      create: jest.fn((value) => value as AiChatRequest),
      save: jest.fn(async (value) => ({ ...value, id: 'request-1' }) as AiChatRequest),
      findOneOrFail: jest.fn(
        async () =>
          ({
            id: 'request-1',
            aiChatSessionId: sessionId,
            requestType: 'UNPARSED',
            sourceMessageId: 'msg-user',
          }) as AiChatRequest,
      ),
    };

    const messageRepo = {
      create: jest.fn((value) => value as AiChatMessage),
      save: jest
        .fn()
        .mockImplementation(async (value) => ({
          ...value,
          id: value.senderType === AiChatMessageSenderType.USER ? 'msg-user' : 'msg-assistant',
          createdAt: new Date('2026-05-04T00:11:00Z'),
        })),
    };

    (dataSource.transaction as jest.Mock).mockImplementation(
      async (callback: (manager: { getRepository: (entity: unknown) => unknown }) => unknown) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === AiChatRequest) {
              return requestRepo;
            }
            if (entity === AiChatMessage) {
              return messageRepo;
            }
            throw new Error('Unexpected entity');
          },
        };
        return callback(manager);
      },
    );

    return { requestRepo, messageRepo };
  }

  describe('listSessions', () => {
    it('returns mapped sessions for the authenticated user', async () => {
      const createdAt = new Date('2026-05-04T00:10:00Z');
      const updatedAt = new Date('2026-05-04T00:12:00Z');

      aiChatSessionRepository.find.mockResolvedValue([
        {
          id: sessionId,
          requesterUserId: user.userId,
          gameRoomId: null,
          status: 'ACTIVE',
          provider: 'openai',
          llmModel: 'gpt-4o',
          createdAt,
          updatedAt,
          closedAt: null,
        } as AiChatSession,
      ]);

      const result = await service.listSessions(user, {});

      expect(result).toHaveLength(1);
      expect(result[0].createdAt).toContain('+09:00');
    });

    it('rejects userId that does not match the authenticated user', async () => {
      await expect(
        service.listSessions(user, { userId: 'other-user' }),
      ).rejects.toMatchObject({
        response: { code: 'FORBIDDEN_RESOURCE_ACCESS' },
        status: HttpStatus.FORBIDDEN,
      });
    });
  });

  describe('listMessages', () => {
    it('returns 404 when the session is not owned by the user', async () => {
      aiChatSessionRepository.findOne.mockResolvedValue(null);

      await expect(service.listMessages(user, sessionId)).rejects.toMatchObject({
        response: { code: AI_CHAT_ERROR.SESSION_NOT_FOUND },
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('createMessage', () => {
    beforeEach(() => {
      aiChatSessionRepository.findOne.mockResolvedValue({
        id: sessionId,
        requesterUserId: user.userId,
        gameRoomId: null,
      } as AiChatSession);
    });

    it('persists COMPLETED ROOM_CREATE with PENDING commandResult after parsing', async () => {
      const callOrder: string[] = [];
      llmIntentParser.parseUserMessage.mockImplementation(async () => {
        callOrder.push('llm');
        return { requestType: 'ROOM_CREATE', payload: { desiredDifficulty: 'EASY' } };
      });

      const { requestRepo, messageRepo } = mockTransactions();
      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        callOrder.push('tx');
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === AiChatRequest) return requestRepo;
            if (entity === AiChatMessage) return messageRepo;
            throw new Error('Unexpected entity');
          },
        };
        return callback(manager);
      });

      const result = await service.createMessage(user, sessionId, {
        message: '쉬운 난이도로 방 만들어줘',
      });

      expect(callOrder).toEqual(['tx', 'llm', 'tx']);
      expect(llmIntentParser.parseUserMessage).toHaveBeenCalledWith({
        message: '쉬운 난이도로 방 만들어줘',
        gameRoomId: null,
      });
      expect(requestRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestType: 'UNPARSED',
          status: AiChatRequestStatus.RECEIVED,
        }),
      );
      expect(requestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestType: AiChatRequestType.ROOM_CREATE,
          status: AiChatRequestStatus.COMPLETED,
        }),
      );
      expect(messageRepo.save).toHaveBeenCalledTimes(2);
      expect(llmFollowUpGenerator.generateCommandFollowUp).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({ requestType: AiChatRequestType.ROOM_CREATE }),
          userMessage: '쉬운 난이도로 방 만들어줘',
        }),
      );
      expect(requestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          responsePayload: expect.objectContaining({
            followUp: expect.objectContaining({ source: 'static_fallback' }),
          }),
        }),
      );
      expect(result).toMatchObject({
        requestType: AiChatRequestType.ROOM_CREATE,
        requestStatus: AiChatRequestStatus.COMPLETED,
        commandResult: {
          commandType: AiChatRequestType.ROOM_CREATE,
          status: AiChatCommandResultStatus.PENDING,
        },
      });
    });

    it('still persists chat when follow-up generation throws', async () => {
      llmIntentParser.parseUserMessage.mockResolvedValue({
        requestType: 'USER_INVITE',
        payload: { inviteeNicknames: ['player2'] },
      });
      llmFollowUpGenerator.generateCommandFollowUp.mockRejectedValue(
        new Error('follow-up unavailable'),
      );

      const { requestRepo, messageRepo } = mockTransactions();

      const result = await service.createMessage(user, sessionId, {
        message: '@player2 초대해줘',
      });

      expect(result.requestStatus).toBe(AiChatRequestStatus.COMPLETED);
      expect(messageRepo.save).toHaveBeenCalledTimes(2);
      expect(requestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AiChatRequestStatus.COMPLETED,
          responsePayload: expect.objectContaining({
            followUp: expect.objectContaining({ source: 'static_fallback' }),
          }),
        }),
      );
    });

    it('returns FAILED clarification without downstream command execution', async () => {
      llmIntentParser.parseUserMessage.mockResolvedValue({
        requestType: null,
        confidence: 'low',
        assistantHint: '무엇을 도와드릴까요?',
      });

      const { requestRepo, messageRepo } = mockTransactions();

      const result = await service.createMessage(user, sessionId, {
        message: '안녕하세요',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(2);
      expect(requestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AiChatRequestStatus.FAILED,
          responsePayload: expect.objectContaining({ parseOutcome: 'ambiguous' }),
        }),
      );
      expect(messageRepo.save).toHaveBeenCalledTimes(2);
      expect(result.assistantMessage.content).toBe('무엇을 도와드릴까요?');
      expect(result.requestStatus).toBe(AiChatRequestStatus.FAILED);
    });

    it('does not expose unsafe assistantHint in FAILED clarification response', async () => {
      llmIntentParser.parseUserMessage.mockResolvedValue({
        requestType: null,
        confidence: 'low',
        assistantHint: 'Bearer sk-secret1234567890 leaked',
      });

      const { messageRepo } = mockTransactions();

      const result = await service.createMessage(user, sessionId, {
        message: '안녕하세요',
      });

      expect(result.assistantMessage.content).toBe(DEFAULT_CLARIFICATION_MESSAGE);
      expect(result.assistantMessage.content).not.toContain('Bearer');
      expect(messageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: AiChatMessageType.TEXT,
          content: DEFAULT_CLARIFICATION_MESSAGE,
        }),
      );
    });

    it('persists history then throws AI_CHAT_COMMAND_NOT_SUPPORTED for unsupported LLM intent', async () => {
      const callOrder: string[] = [];
      const llmRaw = {
        requestType: 'SEND_EMAIL',
        payload: { channel: 'email' },
        confidence: 'high' as const,
        assistantHint: '이메일을 보내 드릴게요',
      };
      llmIntentParser.parseUserMessage.mockImplementation(async () => {
        callOrder.push('llm');
        return llmRaw;
      });

      const { requestRepo, messageRepo } = mockTransactions();
      (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
        callOrder.push('tx');
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === AiChatRequest) return requestRepo;
            if (entity === AiChatMessage) return messageRepo;
            throw new Error('Unexpected entity');
          },
        };
        return callback(manager);
      });

      await expect(
        service.createMessage(user, sessionId, { message: '이메일 보내줘' }),
      ).rejects.toMatchObject({
        response: {
          code: AI_CHAT_ERROR.COMMAND_NOT_SUPPORTED,
          message: expect.stringContaining('SEND_EMAIL'),
        },
        status: HttpStatus.BAD_REQUEST,
      });

      expect(callOrder).toEqual(['tx', 'llm', 'tx']);
      expect(dataSource.transaction).toHaveBeenCalledTimes(2);
      expect(messageRepo.save).toHaveBeenCalledTimes(1);
      const saveCalls = (requestRepo.save as jest.Mock).mock.calls;
      const unsupportedSave = saveCalls[saveCalls.length - 1][0];
      expect(unsupportedSave).toMatchObject({
        requestType: 'UNPARSED',
        status: AiChatRequestStatus.FAILED,
        requestPayload: { llmRaw },
        responsePayload: {
          parseOutcome: 'unsupported',
          errorCode: AI_CHAT_ERROR.COMMAND_NOT_SUPPORTED,
          rawRequestType: 'SEND_EMAIL',
          llmRaw,
        },
      });
    });

    it('returns 404 when posting to a session not owned by the user', async () => {
      aiChatSessionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createMessage(user, sessionId, { message: 'hello' }),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });
});
