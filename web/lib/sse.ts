import type { SseEvent } from './types';

const KNOWN_EVENT_TYPES = new Set<SseEvent['type']>([
  'stage',
  'token',
  'tool_start',
  'tool_end',
  'error',
  'done',
]);

function parseSseBlock(block: string): SseEvent | null {
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue; // heartbeat / comment
    if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
  }

  if (dataLines.length === 0 || !KNOWN_EVENT_TYPES.has(eventName as SseEvent['type'])) return null;

  try {
    const data = JSON.parse(dataLines.join('\n'));
    return { type: eventName, data } as SseEvent;
  } catch {
    return null;
  }
}

export interface StreamChatParams {
  apiUrl: string;
  sessionId: string;
  message: string;
  signal?: AbortSignal;
  onEvent: (event: SseEvent) => void;
}

/**
 * Posts a chat message and streams the Server-Sent Events response. Uses
 * fetch + a manual SSE parser (rather than EventSource) because EventSource
 * cannot send a POST body.
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const res = await fetch(`${params.apiUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: params.sessionId, message: params.message }),
    signal: params.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const event = parseSseBlock(rawBlock);
      if (event) params.onEvent(event);
      separatorIndex = buffer.indexOf('\n\n');
    }
  }
}
