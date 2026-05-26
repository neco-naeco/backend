export const LLM_INTENT_PARSER = Symbol('LLM_INTENT_PARSER');

/** Raw JSON shape returned by the LLM before server validation. */
export interface LlmIntentRawResponse {
  requestType: string | null;
  confidence?: 'high' | 'low';
  payload?: Record<string, unknown>;
  assistantHint?: string;
}

export interface LlmIntentParseInput {
  message: string;
  gameRoomId?: string | null;
}

export interface LlmIntentParserPort {
  parseUserMessage(input: LlmIntentParseInput): Promise<LlmIntentRawResponse>;
}
