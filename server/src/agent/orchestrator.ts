import { getToolSpecsForLLM, runTool } from './tools/index.js';
import type { ToolContext } from './tools/types.js';
import { buildSystemPrompt } from './prompts.js';
import type { LLMMessage, LLMProvider, LLMToolCall } from '../llm/provider.js';
import type { ToolResult } from '../utils/errors.js';
import { maskSensitive } from '../utils/errors.js';
import type { AppLogger } from '../utils/logger.js';
import type { SessionState } from '../session/store.js';

const MAX_TOOL_ITERATIONS = 5;
const MAX_HISTORY_MESSAGES = 20;
const AGENT_TEMPERATURE = 0.3;

const FALLBACK_MESSAGE =
  "I'm sorry, I'm having trouble completing that request right now. Could you tell me again — in one message — what you'd like help with, or share a phone number or booking ID so I can look it up directly?";

const LLM_ERROR_MESSAGE = "I'm having trouble responding right now, please try again in a moment.";

export type OrchestratorEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_end'; id: string; name: string; ok: boolean; summary: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface RunTurnParams {
  provider: LLMProvider;
  model: string;
  session: SessionState;
  userMessage: string;
  toolContext: ToolContext;
  onEvent: (event: OrchestratorEvent) => void;
  logger: AppLogger;
  signal?: AbortSignal;
}

/** Keeps the last N messages, dropping a leading orphaned `tool` message so every tool reply still has its parent assistant tool_calls message. */
function trimHistory(messages: LLMMessage[], maxMessages: number): LLMMessage[] {
  let trimmed = messages.slice(-maxMessages);
  while (trimmed.length > 0 && trimmed[0]?.role === 'tool') {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

const SENSITIVE_KEY_PATTERN = /phone|email/i;

/** Masks email/phone argument values (keeps last 4 chars) before they go out over SSE. */
function redactArgsForClient(args: unknown): Record<string, unknown> {
  if (typeof args !== 'object' || args === null) return {};
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === 'string' && SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = maskSensitive(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function summarizeToolResult(name: string, result: ToolResult<unknown>): string {
  const label = name.replace(/_/g, ' ');
  if (!result.ok) {
    return `Couldn't complete ${label} (${result.error_code})`;
  }
  const data = result.data as Record<string, unknown> | unknown[];
  switch (name) {
    case 'create_lead': {
      const id = (data as { leadId?: string }).leadId;
      return id ? `Lead created in Zoho (ID …${id.slice(-4)})` : 'Lead created in Zoho';
    }
    case 'update_deal_followup': {
      const id = (data as { dealId?: string }).dealId;
      return id ? `Deal follow-up updated (ID …${id.slice(-4)})` : 'Deal follow-up updated';
    }
    case 'create_service_case': {
      const ref = (data as { ticketReference?: string }).ticketReference;
      return ref ? `Service case created (Ref ${ref})` : 'Service case created';
    }
    case 'create_contact': {
      const id = (data as { contactId?: string }).contactId;
      return id ? `Contact registered in Zoho (ID …${id.slice(-4)})` : 'Contact registered in Zoho';
    }
    case 'get_vehicle_info':
      return 'Looked up vehicle catalog';
    case 'find_customer':
      return 'Looked up customer records';
    case 'get_deal_status':
      return 'Fetched deal status';
    case 'get_booking_status':
      return 'Fetched booking status';
    case 'get_service_schedule':
      return 'Fetched service schedule';
    default:
      return `${label} completed`;
  }
}

interface ToolCallBuffer {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Runs the tool-calling agent loop for a single user turn: streams the
 * model's reply, accumulates fragmented tool_call deltas by index,
 * executes any requested tools (in parallel), feeds results back, and
 * repeats until the model produces a plain text reply or the iteration
 * cap is hit. Mutates and returns `session` with the new messages appended.
 */
export async function runTurn(params: RunTurnParams): Promise<SessionState> {
  const { session } = params;
  session.messages.push({ role: 'user', content: params.userMessage });

  const toolSpecs = getToolSpecsForLLM();

  for (let iteration = 1; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    const systemPrompt = buildSystemPrompt(session);
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...trimHistory(session.messages, MAX_HISTORY_MESSAGES),
    ];

    const toolCallBuffers = new Map<number, ToolCallBuffer>();
    let assistantText = '';

    try {
      for await (const event of params.provider.streamChatCompletion({
        model: params.model,
        messages,
        tools: toolSpecs,
        temperature: AGENT_TEMPERATURE,
        signal: params.signal,
      })) {
        if (event.type === 'content_delta') {
          assistantText += event.text;
          params.onEvent({ type: 'token', text: event.text });
        } else if (event.type === 'tool_call_delta') {
          const buf = toolCallBuffers.get(event.index) ?? { id: '', name: '', arguments: '' };
          if (event.id) buf.id = event.id;
          if (event.name) buf.name = event.name;
          if (event.argumentsDelta) buf.arguments += event.argumentsDelta;
          toolCallBuffers.set(event.index, buf);
        }
      }
    } catch (err) {
      if (params.signal?.aborted) {
        // Client disconnected — nothing left to stream to.
        return session;
      }
      params.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'LLM streaming failed',
      );
      params.onEvent({ type: 'error', message: LLM_ERROR_MESSAGE });
      params.onEvent({ type: 'done' });
      return session;
    }

    const toolCalls: ToolCallBuffer[] = [...toolCallBuffers.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v);

    if (toolCalls.length === 0) {
      session.messages.push({ role: 'assistant', content: assistantText });
      session.updatedAt = Date.now();
      params.onEvent({ type: 'done' });
      return session;
    }

    session.messages.push({
      role: 'assistant',
      content: assistantText.length > 0 ? assistantText : null,
      tool_calls: toolCalls.map((tc): LLMToolCall => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    });

    const executions = toolCalls.map(async (tc) => {
      let args: unknown = {};
      try {
        args = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        args = {};
      }

      params.onEvent({
        type: 'tool_start',
        id: tc.id,
        name: tc.name,
        args: redactArgsForClient(args),
      });
      const startedAt = Date.now();
      const result = await runTool(tc.name, args, params.toolContext);
      const durationMs = Date.now() - startedAt;

      params.logger.info(
        {
          sessionId: params.toolContext.sessionId,
          stage: session.stage,
          tool: tc.name,
          ok: result.ok,
          durationMs,
        },
        'Tool call completed',
      );

      params.onEvent({
        type: 'tool_end',
        id: tc.id,
        name: tc.name,
        ok: result.ok,
        summary: summarizeToolResult(tc.name, result),
      });
      return { tc, result };
    });

    const settled = await Promise.all(executions);
    for (const { tc, result } of settled) {
      session.messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(result),
      });
    }
  }

  session.messages.push({ role: 'assistant', content: FALLBACK_MESSAGE });
  session.updatedAt = Date.now();
  params.onEvent({ type: 'token', text: FALLBACK_MESSAGE });
  params.onEvent({ type: 'done' });
  return session;
}
