import Groq from 'groq-sdk';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions';
import type { AppLogger } from '../utils/logger.js';
import type {
  ChatCompletionParams,
  JsonCompletionParams,
  LLMMessage,
  LLMProvider,
  LLMStreamEvent,
} from './provider.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toGroqMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content ?? '', tool_call_id: m.tool_call_id ?? '' };
    }
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.tool_calls?.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === 'system') {
      return { role: 'system', content: m.content ?? '' };
    }
    return { role: 'user', content: m.content ?? '' };
  });
}

/**
 * Retries once on HTTP 429, waiting for the provider's Retry-After header
 * (or a 1s default) before retrying. Any other error propagates immediately.
 */
async function withRateLimitRetry<T>(logger: AppLogger, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Groq.RateLimitError) {
      const retryAfterHeader = err.headers?.['retry-after'];
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined;
      const delayMs = retryAfterSec && Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 1000;
      logger.warn({ delayMs }, 'Groq rate limited (429), retrying once');
      await sleep(delayMs);
      return await fn();
    }
    throw err;
  }
}

export class GroqProvider implements LLMProvider {
  private readonly client: Groq;

  constructor(
    apiKey: string,
    private readonly logger: AppLogger,
  ) {
    this.client = new Groq({ apiKey });
  }

  async *streamChatCompletion(
    params: ChatCompletionParams,
  ): AsyncGenerator<LLMStreamEvent, void, unknown> {
    const tools: ChatCompletionTool[] | undefined = params.tools?.map((t) => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const stream = await withRateLimitRetry(this.logger, () =>
      this.client.chat.completions.create(
        {
          model: params.model,
          messages: toGroqMessages(params.messages),
          tools,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: params.temperature,
          stream: true,
        },
        { signal: params.signal },
      ),
    );

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.delta.content) {
        yield { type: 'content_delta', text: choice.delta.content };
      }

      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          yield {
            type: 'tool_call_delta',
            index: tc.index,
            id: tc.id,
            name: tc.function?.name,
            argumentsDelta: tc.function?.arguments,
          };
        }
      }

      if (choice.finish_reason) {
        yield { type: 'finish', reason: choice.finish_reason };
      }
    }
  }

  async createJsonCompletion(params: JsonCompletionParams): Promise<string> {
    const response = await withRateLimitRetry(this.logger, () =>
      this.client.chat.completions.create(
        {
          model: params.model,
          messages: toGroqMessages(params.messages),
          temperature: params.temperature,
          response_format: { type: 'json_object' },
          stream: false,
        },
        { signal: params.signal },
      ),
    );
    return response.choices[0]?.message?.content ?? '';
  }
}
