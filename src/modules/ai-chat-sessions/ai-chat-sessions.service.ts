import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { toSeoulIso } from '../../common/utils/date.util';
import {
  LLM_FOLLOW_UP_GENERATOR,
  type LlmFollowUpGeneratorPort,
} from '../../integrations/llm/llm-follow-up.port';
import {
  LLM_INTENT_PARSER,
  type LlmIntentParserPort,
  type LlmIntentRawResponse,
} from '../../integrations/llm/llm-intent-parser.port';
import {
  AiChatMessageSenderType,
  AiChatMessageType,
  AiChatRequestStatus,
  AiChatRequestType,
} from '../../shared/enums/ai-chat.enum';
import type { AiChatCommandResultDto } from '../../shared/dto/ai-chat-command.dto';
import { AI_CHAT_REQUEST_TYPE_UNPARSED } from './constants/ai-chat-internal.constants';
import {
  AI_CHAT_ERROR,
  throwAiChatError,
  throwForbiddenAccess,
} from './constants/ai-chat-error.constants';
import { CreateAiChatMessageDto } from './dto/create-ai-chat-message.dto';
import { ListAiChatSessionsQueryDto } from './dto/list-ai-chat-sessions-query.dto';
import { AiChatMessage } from './entity/ai-chat-message.entity';
import { AiChatRequest } from './entity/ai-chat-request.entity';
import { AiChatSession } from './entity/ai-chat-session.entity';
import { buildSafeStaticFollowUpContent } from './intent/ai-chat-assistant-content';
import { AiChatCommandResultMapper } from './intent/ai-chat-command-result.mapper';
import {
  AiChatIntentValidator,
  type IntentValidationUnsupported,
} from './intent/ai-chat-intent.validator';

export interface AiChatSessionListItem {
  aiChatSessionId: string;
  requesterUserId: string;
  gameRoomId: string | null;
  status: string;
  provider: string;
  llmModel: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface AiChatMessageItem {
  messageId: string;
  aiChatRequestId: string | null;
  senderType: string;
  messageType: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Matches docs/etc/api-spec.md §9 POST messages success schema. */
export interface CreateAiChatMessageResult {
  aiChatRequestId: string;
  /** Required when requestStatus is COMPLETED or FAILED; omitted when RECEIVED. */
  requestType?: string;
  requestStatus: string;
  userMessage: AiChatMessageItem;
  assistantMessage: AiChatMessageItem;
  commandResult: AiChatCommandResultDto | null;
}

@Injectable()
export class AiChatSessionsService {
  private readonly intentValidator = new AiChatIntentValidator();
  private readonly commandResultMapper = new AiChatCommandResultMapper();

  constructor(
    @InjectRepository(AiChatSession)
    private readonly aiChatSessionRepository: Repository<AiChatSession>,
    @InjectRepository(AiChatMessage)
    private readonly aiChatMessageRepository: Repository<AiChatMessage>,
    @InjectRepository(AiChatRequest)
    private readonly aiChatRequestRepository: Repository<AiChatRequest>,
    private readonly dataSource: DataSource,
    @Inject(LLM_INTENT_PARSER)
    private readonly llmIntentParser: LlmIntentParserPort,
    @Inject(LLM_FOLLOW_UP_GENERATOR)
    private readonly llmFollowUpGenerator: LlmFollowUpGeneratorPort,
  ) {}

  async listSessions(
    user: AuthenticatedUser,
    query: ListAiChatSessionsQueryDto,
  ): Promise<AiChatSessionListItem[]> {
    if (query.userId && query.userId !== user.userId) {
      throwForbiddenAccess('userId does not match the authenticated user');
    }

    const where: FindOptionsWhere<AiChatSession> = {
      requesterUserId: user.userId,
    };

    if (query.gameRoomId) {
      where.gameRoomId = query.gameRoomId;
    }

    const sessions = await this.aiChatSessionRepository.find({
      where,
      order: { createdAt: 'ASC' },
    });

    return sessions.map((session) => this.toSessionListItem(session));
  }

  async listMessages(
    user: AuthenticatedUser,
    aiChatSessionId: string,
  ): Promise<AiChatMessageItem[]> {
    const session = await this.requireOwnedSession(user.userId, aiChatSessionId);

    const messages = await this.aiChatMessageRepository.find({
      where: { aiChatSessionId: session.id },
      order: { createdAt: 'ASC' },
    });

    return messages.map((message) => this.toMessageItem(message));
  }

  async createMessage(
    user: AuthenticatedUser,
    aiChatSessionId: string,
    dto: CreateAiChatMessageDto,
  ): Promise<CreateAiChatMessageResult> {
    const session = await this.requireOwnedSession(user.userId, aiChatSessionId);
    const now = new Date();

    const bootstrap = await this.dataSource.transaction(async (manager) =>
      this.persistUserMessageTurn(
        manager.getRepository(AiChatRequest),
        manager.getRepository(AiChatMessage),
        aiChatSessionId,
        user,
        dto.message,
        now,
      ),
    );

    const rawIntent = await this.llmIntentParser.parseUserMessage({
      message: dto.message,
      gameRoomId: session.gameRoomId,
    });

    const validation = this.intentValidator.validate(rawIntent);

    if (validation.outcome === 'unsupported') {
      await this.persistUnsupportedRequestHistory(
        bootstrap.savedRequest.id,
        validation,
        rawIntent,
        now,
      );
      throwAiChatError(
        validation.errorCode,
        validation.content,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(AiChatRequest);
      const messageRepo = manager.getRepository(AiChatMessage);

      const savedRequest = await requestRepo.findOneOrFail({
        where: { id: bootstrap.savedRequest.id },
      });

      if (validation.outcome === 'clarification') {
        return this.finalizeFailedParseTurn(
          requestRepo,
          messageRepo,
          savedRequest,
          bootstrap.savedUserMessage,
          validation.content,
          { parseOutcome: 'ambiguous' },
          now,
        );
      }

      const { command, assistantHint } = validation;
      const followUp = await this.resolveCommandFollowUp(
        command,
        dto.message,
        assistantHint,
        session.gameRoomId,
      );
      const commandResult = this.commandResultMapper.toPendingResult(command);

      savedRequest.requestType = command.requestType;
      savedRequest.requestPayload = {
        message: dto.message,
        command,
        llmRaw: rawIntent,
      };
      savedRequest.responsePayload = {
        extractedCommand: command,
        commandResult,
        followUp: {
          source: followUp.followUpSource,
          templateKey: followUp.templateKey,
        },
      };
      savedRequest.status = AiChatRequestStatus.COMPLETED;
      savedRequest.respondedAt = now;
      await requestRepo.save(savedRequest);

      const assistantMessage = messageRepo.create({
        aiChatSessionId,
        aiChatRequestId: savedRequest.id,
        senderType: AiChatMessageSenderType.ASSISTANT,
        senderUserId: null,
        messageType: AiChatMessageType.COMMAND_RESULT,
        content: followUp.content,
        metadataJson: followUp.metadata,
      });
      const savedAssistantMessage = await messageRepo.save(assistantMessage);

      return {
        aiChatRequestId: savedRequest.id,
        requestType: command.requestType,
        requestStatus: AiChatRequestStatus.COMPLETED,
        userMessage: this.toMessageItem(bootstrap.savedUserMessage),
        assistantMessage: this.toMessageItem(savedAssistantMessage),
        commandResult,
      };
    });
  }

  private async persistUnsupportedRequestHistory(
    aiChatRequestId: string,
    validation: IntentValidationUnsupported,
    rawIntent: LlmIntentRawResponse,
    now: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(AiChatRequest);
      const savedRequest = await requestRepo.findOneOrFail({
        where: { id: aiChatRequestId },
      });

      savedRequest.requestType = AI_CHAT_REQUEST_TYPE_UNPARSED;
      savedRequest.requestPayload = {
        ...(typeof savedRequest.requestPayload === 'object' && savedRequest.requestPayload !== null
          ? savedRequest.requestPayload
          : {}),
        llmRaw: rawIntent,
      };
      savedRequest.responsePayload = {
        parseOutcome: 'unsupported',
        errorCode: validation.errorCode,
        rawRequestType: validation.rawRequestType,
        llmRaw: rawIntent,
      };
      savedRequest.status = AiChatRequestStatus.FAILED;
      savedRequest.respondedAt = now;
      await requestRepo.save(savedRequest);
    });
  }

  private async persistUserMessageTurn(
    requestRepo: Repository<AiChatRequest>,
    messageRepo: Repository<AiChatMessage>,
    aiChatSessionId: string,
    user: AuthenticatedUser,
    userContent: string,
    now: Date,
  ): Promise<{ savedRequest: AiChatRequest; savedUserMessage: AiChatMessage }> {
    const request = requestRepo.create({
      aiChatSessionId,
      requestType: AI_CHAT_REQUEST_TYPE_UNPARSED,
      sourceMessageId: null,
      requestPayload: { message: userContent },
      responsePayload: null,
      status: AiChatRequestStatus.RECEIVED,
      requestedAt: now,
      respondedAt: null,
    });
    const savedRequest = await requestRepo.save(request);

    const userMessage = messageRepo.create({
      aiChatSessionId,
      aiChatRequestId: savedRequest.id,
      senderType: AiChatMessageSenderType.USER,
      senderUserId: user.userId,
      messageType: AiChatMessageType.TEXT,
      content: userContent,
      metadataJson: null,
    });
    const savedUserMessage = await messageRepo.save(userMessage);

    savedRequest.sourceMessageId = savedUserMessage.id;
    await requestRepo.save(savedRequest);

    return { savedRequest, savedUserMessage };
  }

  private async finalizeFailedParseTurn(
    requestRepo: Repository<AiChatRequest>,
    messageRepo: Repository<AiChatMessage>,
    savedRequest: AiChatRequest,
    savedUserMessage: AiChatMessage,
    assistantContent: string,
    responseMeta: Record<string, unknown>,
    now: Date,
  ): Promise<CreateAiChatMessageResult> {
    const nominalType = AiChatRequestType.ROOM_CREATE;
    const commandResult = this.commandResultMapper.toFailedResult(nominalType);

    savedRequest.requestType = nominalType;
    savedRequest.responsePayload = {
      ...responseMeta,
      commandResult,
    };
    savedRequest.status = AiChatRequestStatus.FAILED;
    savedRequest.respondedAt = now;
    await requestRepo.save(savedRequest);

    const assistantMessage = messageRepo.create({
      aiChatSessionId: savedRequest.aiChatSessionId,
      aiChatRequestId: savedRequest.id,
      senderType: AiChatMessageSenderType.ASSISTANT,
      senderUserId: null,
      messageType: AiChatMessageType.TEXT,
      content: assistantContent,
      metadataJson: { parseOutcome: responseMeta.parseOutcome },
    });
    const savedAssistantMessage = await messageRepo.save(assistantMessage);

    return {
      aiChatRequestId: savedRequest.id,
      requestType: nominalType,
      requestStatus: AiChatRequestStatus.FAILED,
      userMessage: this.toMessageItem(savedUserMessage),
      assistantMessage: this.toMessageItem(savedAssistantMessage),
      commandResult,
    };
  }

  private async resolveCommandFollowUp(
    command: Parameters<LlmFollowUpGeneratorPort['generateCommandFollowUp']>[0]['command'],
    userMessage: string,
    assistantHint: string | undefined,
    gameRoomId: string | null,
  ) {
    try {
      return await this.llmFollowUpGenerator.generateCommandFollowUp({
        command,
        userMessage,
        assistantHint,
        gameRoomId,
      });
    } catch {
      const staticFallback = buildSafeStaticFollowUpContent(command);
      return {
        content: staticFallback.content,
        metadata: {
          ...staticFallback.metadata,
          followUpSource: 'static_fallback' as const,
          templateKey: null,
        },
        followUpSource: 'static_fallback' as const,
        templateKey: null,
      };
    }
  }

  private async requireOwnedSession(
    userId: string,
    aiChatSessionId: string,
  ): Promise<AiChatSession> {
    const session = await this.aiChatSessionRepository.findOne({
      where: { id: aiChatSessionId, requesterUserId: userId },
    });

    if (!session) {
      throwAiChatError(
        AI_CHAT_ERROR.SESSION_NOT_FOUND,
        'AI chat session not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return session;
  }

  private toSessionListItem(session: AiChatSession): AiChatSessionListItem {
    return {
      aiChatSessionId: session.id,
      requesterUserId: session.requesterUserId,
      gameRoomId: session.gameRoomId,
      status: session.status,
      provider: session.provider,
      llmModel: session.llmModel,
      createdAt: toSeoulIso(session.createdAt),
      updatedAt: toSeoulIso(session.updatedAt),
      closedAt: session.closedAt ? toSeoulIso(session.closedAt) : null,
    };
  }

  private toMessageItem(message: AiChatMessage): AiChatMessageItem {
    return {
      messageId: message.id,
      aiChatRequestId: message.aiChatRequestId,
      senderType: message.senderType,
      messageType: message.messageType,
      content: message.content,
      metadata: message.metadataJson,
      createdAt: toSeoulIso(message.createdAt),
    };
  }
}
