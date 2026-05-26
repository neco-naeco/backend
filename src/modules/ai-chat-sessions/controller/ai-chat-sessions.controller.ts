import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AiChatSessionsService } from '../ai-chat-sessions.service';
import { CreateAiChatMessageDto } from '../dto/create-ai-chat-message.dto';
import { ListAiChatSessionsQueryDto } from '../dto/list-ai-chat-sessions-query.dto';

@Controller('ai-chat-sessions')
export class AiChatSessionsController {
  constructor(private readonly aiChatSessionsService: AiChatSessionsService) {}

  @Get()
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAiChatSessionsQueryDto,
  ) {
    return this.aiChatSessionsService.listSessions(user, query);
  }

  @Get(':aiChatSessionId/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('aiChatSessionId', ParseUUIDPipe) aiChatSessionId: string,
  ) {
    return this.aiChatSessionsService.listMessages(user, aiChatSessionId);
  }

  @Post(':aiChatSessionId/messages')
  createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('aiChatSessionId', ParseUUIDPipe) aiChatSessionId: string,
    @Body() body: CreateAiChatMessageDto,
  ) {
    return this.aiChatSessionsService.createMessage(user, aiChatSessionId, body);
  }
}
