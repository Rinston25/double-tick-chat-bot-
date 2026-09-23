import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { applyClassification, classifyTurn } from '../src/agent/classifier.js';
import { createEmptySession } from '../src/session/store.js';
import type { LLMProvider } from '../src/llm/provider.js';

const silentLogger = pino({ level: 'silent' });

function makeProvider(createJsonCompletion: LLMProvider['createJsonCompletion']): LLMProvider {
  return {
    // Not used by the classifier.
    streamChatCompletion: async function* () {},
    createJsonCompletion,
  };
}

describe('classifyTurn', () => {
  it('parses a valid classification response', async () => {
    const provider = makeProvider(async () =>
      JSON.stringify({ stage: 'NEW_LEAD', confidence: 0.92, entities: { vehicle_model: 'Thar' } }),
    );
    const session = createEmptySession('s1');

    const result = await classifyTurn({
      provider,
      model: 'test-model',
      recentMessages: [{ role: 'user', content: 'Tell me about the Thar' }],
      session,
      logger: silentLogger,
    });

    expect(result.stage).toBe('NEW_LEAD');
    expect(result.confidence).toBe(0.92);
    expect(result.entities.vehicle_model).toBe('Thar');
  });

  it('falls back to the previous stage on malformed JSON', async () => {
    const provider = makeProvider(async () => 'not valid json{{{');
    const session = createEmptySession('s1');
    session.stage = 'BOOKED_VEHICLE';
    session.stageConfidence = 0.7;

    const result = await classifyTurn({
      provider,
      model: 'test-model',
      recentMessages: [],
      session,
      logger: silentLogger,
    });

    expect(result.stage).toBe('BOOKED_VEHICLE');
    expect(result.confidence).toBe(0.7);
    expect(result.entities).toEqual({});
  });

  it('falls back to the previous stage when the JSON does not match the schema', async () => {
    const provider = makeProvider(async () =>
      JSON.stringify({ stage: 'NOT_A_REAL_STAGE', confidence: 2 }),
    );
    const session = createEmptySession('s1');
    session.stage = 'ONGOING_PIPELINE';

    const result = await classifyTurn({
      provider,
      model: 'test-model',
      recentMessages: [],
      session,
      logger: silentLogger,
    });

    expect(result.stage).toBe('ONGOING_PIPELINE');
  });

  it('falls back to the previous stage when the provider throws (e.g. abort/timeout)', async () => {
    const provider = makeProvider(async () => {
      throw new Error('aborted');
    });
    const session = createEmptySession('s1');
    session.stage = 'POST_PURCHASE_SERVICE';
    session.stageConfidence = 0.55;

    const result = await classifyTurn({
      provider,
      model: 'test-model',
      recentMessages: [],
      session,
      logger: silentLogger,
    });

    expect(result.stage).toBe('POST_PURCHASE_SERVICE');
    expect(result.confidence).toBe(0.55);
  });

  it('never throws out of classifyTurn even on catastrophic failure', async () => {
    const provider = makeProvider(async () => {
      throw new Error('network down');
    });
    const session = createEmptySession('s1');
    await expect(
      classifyTurn({
        provider,
        model: 'test-model',
        recentMessages: [],
        session,
        logger: silentLogger,
      }),
    ).resolves.toBeDefined();
  });
});

describe('applyClassification', () => {
  it('updates stage/confidence and merges normalized entities into session state', () => {
    const session = createEmptySession('s1');
    applyClassification(session, {
      stage: 'POST_PURCHASE_SERVICE',
      confidence: 0.8,
      entities: {
        phone: '+91 98765-43210',
        registration_number: 'mh 02 ab 1234',
        vehicle_model: 'XUV700',
      },
    });

    expect(session.stage).toBe('POST_PURCHASE_SERVICE');
    expect(session.stageConfidence).toBe(0.8);
    expect(session.identity.phone).toBe('9876543210');
    expect(session.knownIds.registrationNumber).toBe('MH02AB1234');
    expect(session.knownIds.vehicleModel).toBe('XUV700');
  });

  it('does not clobber a known phone with an absent one', () => {
    const session = createEmptySession('s1');
    session.identity.phone = '9876543210';
    applyClassification(session, { stage: 'GENERAL', confidence: 0.5, entities: {} });
    expect(session.identity.phone).toBe('9876543210');
  });

  it('normalizes a booking id entity to the canonical MAH-XXXX form', () => {
    const session = createEmptySession('s1');
    applyClassification(session, {
      stage: 'BOOKED_VEHICLE',
      confidence: 0.9,
      entities: { booking_id: 'mah9921' },
    });
    expect(session.knownIds.bookingId).toBe('MAH-9921');
  });
});
