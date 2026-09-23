/**
 * Provider-agnostic LLM interface. GroqProvider (llm/groq.ts) is the only
 * implementation today; a GeminiProvider could implement the same
 * interface later without touching the orchestrator or classifier.
 */

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments, as returned by the model — parse and validate before use. */
  arguments: string;
}

export interface LLMMessage {
  role: LLMRole;
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/**
 * Raw, low-level streaming events mirroring the provider's chunk shape.
 * Tool call deltas arrive fragmented (id/name in one chunk, argument
 * fragments across several more) — the orchestrator is responsible for
 * accumulating them per `index` into complete tool calls.
 */
export type LLMStreamEvent =
  | { type: 'content_delta'; text: string }
  | { type: 'tool_call_delta'; index: number; id?: string; name?: string; argumentsDelta?: string }
  | { type: 'finish'; reason: string | null };

export interface ChatCompletionParams {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolSpec[];
  temperature?: number;
  signal?: AbortSignal;
}

export interface JsonCompletionParams {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  streamChatCompletion(params: ChatCompletionParams): AsyncGenerator<LLMStreamEvent, void, unknown>;
  /** Non-streaming, JSON-mode completion — used by the classifier. Returns the raw JSON text. */
  createJsonCompletion(params: JsonCompletionParams): Promise<string>;
}
