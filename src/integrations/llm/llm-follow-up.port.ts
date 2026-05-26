import type { AiChatCommandDto } from '../../shared/dto/ai-chat-command.dto';

export const LLM_FOLLOW_UP_GENERATOR = Symbol('LLM_FOLLOW_UP_GENERATOR');

export type FollowUpSource = 'llm' | 'static_fallback';

export interface LlmFollowUpInput {
  command: AiChatCommandDto;
  userMessage: string;
  assistantHint?: string;
  gameRoomId?: string | null;
}

export interface LlmFollowUpResult {
  content: string;
  metadata: Record<string, unknown> | null;
  followUpSource: FollowUpSource;
  templateKey: string | null;
}

export interface LlmFollowUpGeneratorPort {
  generateCommandFollowUp(input: LlmFollowUpInput): Promise<LlmFollowUpResult>;
}
