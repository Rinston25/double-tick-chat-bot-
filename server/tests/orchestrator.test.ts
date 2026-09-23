import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { runTurn, type OrchestratorEvent } from '../src/agent/orchestrator.js';
import { createEmptySession } from '../src/session/store.js';
import type { LLMProvider, LLMStreamEvent } from '../src/llm/provider.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import type { ZohoClient } from '../src/zoho/client.js';

const silentLogger = pino({ level: 'silent' });

function makeScriptedProvider(callScripts: LLMStreamEvent[][]): LLMProvider {
  let callIndex = 0;
  return {
    async *streamChatCompletion() {
      const script = callScripts[callIndex];
      const thisCall = callIndex;
      callIndex++;
      if (!script)
        throw new Error(`Test provider: no script registered for call index ${thisCall}`);
      for (const event of script) {
        yield event;
      }
    },
    async createJsonCompletion() {
      return '{}';
    },
  };
}

function makeToolContext(): ToolContext {
  const zohoClient = {
    search: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
    put: vi.fn(),
  } as unknown as ZohoClient;
  return { zohoClient, logger: silentLogger, sessionId: 'sess-1' };
}

describe('runTurn — tool call delta accumulation', () => {
  it('reassembles a tool call fragmented across many deltas (id+name in one chunk, arguments split across several), executes it, then completes with the model’s follow-up text', async () => {
    const provider = makeScriptedProvider([
      [
        // First chunk of a streamed tool call: only id + name, no arguments yet.
        { type: 'tool_call_delta', index: 0, id: 'call_abc123', name: 'get_vehicle_info' },
        // Argument fragments dribble in across several subsequent chunks.
        { type: 'tool_call_delta', index: 0, argumentsDelta: '{"mod' },
        { type: 'tool_call_delta', index: 0, argumentsDelta: 'el":"' },
        { type: 'tool_call_delta', index: 0, argumentsDelta: 'Thar"}' },
        { type: 'finish', reason: 'tool_calls' },
      ],
      [
        { type: 'content_delta', text: 'The ' },
        { type: 'content_delta', text: 'Thar starts at ' },
        { type: 'content_delta', text: '₹12,99,000 (indicative).' },
        { type: 'finish', reason: 'stop' },
      ],
    ]);

    const session = createEmptySession('sess-1');
    const events: OrchestratorEvent[] = [];

    const result = await runTurn({
      provider,
      model: 'test-agent-model',
      session,
      userMessage: 'Tell me about the Thar',
      toolContext: makeToolContext(),
      onEvent: (e) => events.push(e),
      logger: silentLogger,
    });

    const toolStart = events.find((e) => e.type === 'tool_start');
    expect(toolStart).toMatchObject({
      type: 'tool_start',
      id: 'call_abc123',
      name: 'get_vehicle_info',
      args: { model: 'Thar' },
    });

    const toolEnd = events.find((e) => e.type === 'tool_end');
    expect(toolEnd).toMatchObject({
      type: 'tool_end',
      id: 'call_abc123',
      name: 'get_vehicle_info',
      ok: true,
    });

    const tokens = events.filter(
      (e): e is Extract<OrchestratorEvent, { type: 'token' }> => e.type === 'token',
    );
    expect(tokens.map((t) => t.text).join('')).toBe('The Thar starts at ₹12,99,000 (indicative).');

    expect(events.at(-1)).toEqual({ type: 'done' });

    // Session history: user, assistant(tool_calls), tool(result), assistant(final text).
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0]).toMatchObject({ role: 'user', content: 'Tell me about the Thar' });
    expect(result.messages[1]).toMatchObject({ role: 'assistant' });
    expect(result.messages[1]?.tool_calls).toEqual([
      { id: 'call_abc123', name: 'get_vehicle_info', arguments: '{"model":"Thar"}' },
    ]);
    expect(result.messages[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_abc123',
      name: 'get_vehicle_info',
    });
    const toolMessageContent = JSON.parse(result.messages[2]?.content as string);
    expect(toolMessageContent.ok).toBe(true);
    expect(result.messages[3]).toMatchObject({
      role: 'assistant',
      content: 'The Thar starts at ₹12,99,000 (indicative).',
    });
  });

  it('accumulates two interleaved tool calls (index 0 and 1) independently', async () => {
    const provider = makeScriptedProvider([
      [
        { type: 'tool_call_delta', index: 0, id: 'call_A', name: 'get_vehicle_info' },
        { type: 'tool_call_delta', index: 1, id: 'call_B', name: 'get_service_schedule' },
        { type: 'tool_call_delta', index: 0, argumentsDelta: '{"model":"Thar"}' },
        { type: 'tool_call_delta', index: 1, argumentsDelta: '{"model":"XUV700"}' },
        { type: 'finish', reason: 'tool_calls' },
      ],
      [
        { type: 'content_delta', text: 'Here is what I found.' },
        { type: 'finish', reason: 'stop' },
      ],
    ]);

    const session = createEmptySession('sess-1');
    const events: OrchestratorEvent[] = [];

    const result = await runTurn({
      provider,
      model: 'test-agent-model',
      session,
      userMessage: 'Compare Thar and XUV700 service',
      toolContext: makeToolContext(),
      onEvent: (e) => events.push(e),
      logger: silentLogger,
    });

    const toolStarts = events.filter(
      (e): e is Extract<OrchestratorEvent, { type: 'tool_start' }> => e.type === 'tool_start',
    );
    expect(toolStarts).toHaveLength(2);
    expect(toolStarts.find((e) => e.id === 'call_A')).toMatchObject({
      name: 'get_vehicle_info',
      args: { model: 'Thar' },
    });
    expect(toolStarts.find((e) => e.id === 'call_B')).toMatchObject({
      name: 'get_service_schedule',
      args: { model: 'XUV700' },
    });

    // Both tool results recorded before the final assistant message.
    const toolMessages = result.messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(2);
  });

  it('redacts phone/email argument values in tool_start events but not in what is sent to the tool', async () => {
    const provider = makeScriptedProvider([
      [
        { type: 'tool_call_delta', index: 0, id: 'call_1', name: 'find_customer' },
        { type: 'tool_call_delta', index: 0, argumentsDelta: '{"phone":"9876543210"}' },
        { type: 'finish', reason: 'tool_calls' },
      ],
      [
        { type: 'content_delta', text: 'Done.' },
        { type: 'finish', reason: 'stop' },
      ],
    ]);
    const session = createEmptySession('sess-1');
    const events: OrchestratorEvent[] = [];

    await runTurn({
      provider,
      model: 'test-agent-model',
      session,
      userMessage: 'My number is 9876543210',
      toolContext: makeToolContext(),
      onEvent: (e) => events.push(e),
      logger: silentLogger,
    });

    const toolStart = events.find((e) => e.type === 'tool_start') as Extract<
      OrchestratorEvent,
      { type: 'tool_start' }
    >;
    expect(toolStart.args.phone).toBe('******3210');
  });
});

describe('runTurn — iteration cap', () => {
  it('falls back gracefully after 5 tool iterations without an infinite loop', async () => {
    const toolOnlyScript: LLMStreamEvent[] = [
      { type: 'tool_call_delta', index: 0, id: 'call_x', name: 'get_service_schedule' },
      { type: 'tool_call_delta', index: 0, argumentsDelta: '{"model":"XUV700"}' },
      { type: 'finish', reason: 'tool_calls' },
    ];
    const provider = makeScriptedProvider([
      toolOnlyScript,
      toolOnlyScript,
      toolOnlyScript,
      toolOnlyScript,
      toolOnlyScript,
    ]);

    const session = createEmptySession('sess-1');
    const events: OrchestratorEvent[] = [];

    const result = await runTurn({
      provider,
      model: 'test-agent-model',
      session,
      userMessage: 'loop forever please',
      toolContext: makeToolContext(),
      onEvent: (e) => events.push(e),
      logger: silentLogger,
    });

    const toolStarts = events.filter((e) => e.type === 'tool_start');
    expect(toolStarts).toHaveLength(5);
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant' });
    expect((result.messages.at(-1)?.content as string).length).toBeGreaterThan(0);
  });
});

describe('runTurn — LLM streaming failure', () => {
  it('emits a user-safe error and done, and does not throw, when the stream fails mid-flight', async () => {
    const provider: LLMProvider = {
      async *streamChatCompletion() {
        yield { type: 'content_delta', text: 'partial...' };
        throw new Error('upstream exploded');
      },
      async createJsonCompletion() {
        return '{}';
      },
    };

    const session = createEmptySession('sess-1');
    const events: OrchestratorEvent[] = [];

    await expect(
      runTurn({
        provider,
        model: 'test-agent-model',
        session,
        userMessage: 'hello',
        toolContext: makeToolContext(),
        onEvent: (e) => events.push(e),
        logger: silentLogger,
      }),
    ).resolves.toBeDefined();

    const errorEvent = events.find((e) => e.type === 'error') as Extract<
      OrchestratorEvent,
      { type: 'error' }
    >;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).not.toMatch(/upstream exploded/);
    expect(events.at(-1)).toEqual({ type: 'done' });
  });
});
