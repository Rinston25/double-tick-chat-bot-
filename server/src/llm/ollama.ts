import type {
  ChatCompletionParams,
  JsonCompletionParams,
  LLMMessage,
  LLMProvider,
  LLMStreamEvent,
} from './provider.js';

/**
 * Local Ollama provider, talking to its OpenAI-compatible endpoint directly
 * (Ollama serves it at `/v1/chat/completions`, not `/openai/v1/chat/completions`
 * like Groq, so the groq-sdk client can't be pointed at it — hence the plain
 * fetch here instead of reusing GroqProvider).
 */

interface OllamaChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

function toOllamaMessages(messages: LLMMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
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
    return { role: m.role, content: m.content ?? '' };
  });
}

export class OllamaProvider implements LLMProvider {
  constructor(private readonly baseURL: string) {}

  async *streamChatCompletion(
    params: ChatCompletionParams,
  ): AsyncGenerator<LLMStreamEvent, void, unknown> {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        model: params.model,
        messages: toOllamaMessages(params.messages),
        tools: params.tools,
        temperature: params.temperature,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Ollama request failed: ${res.status} ${await res.text().catch(() => '')}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice('data:'.length).trim();
        if (payload === '[DONE]') continue;

        const chunk = JSON.parse(payload) as OllamaChunk;
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.delta?.content) {
          yield { type: 'content_delta', text: choice.delta.content };
        }
        if (choice.delta?.tool_calls) {
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
  }

  async createJsonCompletion(params: JsonCompletionParams): Promise<string> {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        model: params.model,
        messages: toOllamaMessages(params.messages),
        temperature: params.temperature,
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }
}
