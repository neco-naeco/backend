import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmIntegrationModule } from '../../integrations/llm/llm.module';
import { AiChatSessionsController } from './controller/ai-chat-sessions.controller';
import { AiChatSessionsService } from './ai-chat-sessions.service';
import { AiChatMessage } from './entity/ai-chat-message.entity';
import { AiChatRequest } from './entity/ai-chat-request.entity';
import { AiChatSession } from './entity/ai-chat-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiChatSession, AiChatRequest, AiChatMessage]),
    LlmIntegrationModule,
  ],
  controllers: [AiChatSessionsController],
  providers: [AiChatSessionsService],
  exports: [AiChatSessionsService, TypeOrmModule],
})
export class AiChatSessionsModule {}
