import { Module } from '@nestjs/common';
import { LLM_INTENT_PARSER } from './llm-intent-parser.port';
import { LlmIntentParserService } from './llm-intent-parser.service';

/**
 * LLM integration adapter.
 * Covers: AI chat intent parsing, feedback generation, judgment assistance.
 */
@Module({
  providers: [
    LlmIntentParserService,
    {
      provide: LLM_INTENT_PARSER,
      useExisting: LlmIntentParserService,
    },
  ],
  exports: [LLM_INTENT_PARSER, LlmIntentParserService],
})
export class LlmIntegrationModule {}
