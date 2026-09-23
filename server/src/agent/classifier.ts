import { z } from 'zod';
import type { LLMMessage, LLMProvider } from '../llm/provider.js';
import type { SessionState } from '../session/store.js';
import type { AppLogger } from '../utils/logger.js';
import {
  normalizeBookingId,
  normalizeIndianPhone,
  normalizeRegistrationNumber,
} from '../utils/validators.js';

const CLASSIFIER_TIMEOUT_MS = 1500;

const classifierResultSchema = z.object({
  stage: z.enum([
    'NEW_LEAD',
    'ONGOING_PIPELINE',
    'BOOKED_VEHICLE',
    'POST_PURCHASE_SERVICE',
    'GENERAL',
  ]),
  confidence: z.number().min(0).max(1),
  entities: z
    .object({
      phone: z.string().optional(),
      booking_id: z.string().optional(),
      deal_id: z.string().optional(),
      vehicle_model: z.string().optional(),
      registration_number: z.string().optional(),
    })
    .default({}),
});

export type ClassifierEntities = z.infer<typeof classifierResultSchema>['entities'];
export type ClassifierResult = z.infer<typeof classifierResultSchema>;

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a Mahindra automotive AI chat agent. Classify which lifecycle stage the CURRENT user turn belongs to, given the recent conversation and known session state:
- NEW_LEAD: unidentified visitor asking about models, variants, pricing, or features, or wanting to enquire/test drive.
- ONGOING_PIPELINE: existing prospect asking about a test drive confirmation, quotation, or dealer contact, or an already-known deal.
- BOOKED_VEHICLE: customer who has paid a booking amount, asking about delivery, VIN allocation, or balance payment.
- POST_PURCHASE_SERVICE: existing owner logging a complaint, asking about service intervals, or booking maintenance.
- GENERAL: greetings, small talk, or anything that doesn't clearly fit the above yet.

Also extract any entities explicitly mentioned in the latest user message: phone, booking_id, deal_id, vehicle_model, registration_number. Omit a key entirely if it was not mentioned — never guess or invent one.

Respond with ONLY a single JSON object of the exact shape:
{"stage": "NEW_LEAD" | "ONGOING_PIPELINE" | "BOOKED_VEHICLE" | "POST_PURCHASE_SERVICE" | "GENERAL", "confidence": <number 0 to 1>, "entities": {"phone"?: string, "booking_id"?: string, "deal_id"?: string, "vehicle_model"?: string, "registration_number"?: string}}`;

function formatRecentMessages(messages: LLMMessage[]): string {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-6)
    .map((m) => `${m.role}: ${m.content ?? '(tool call)'}`)
    .join('\n');
}

export interface ClassifyTurnParams {
  provider: LLMProvider;
  model: string;
  recentMessages: LLMMessage[];
  session: SessionState;
  logger: AppLogger;
}

/**
 * Classifies the current turn's lifecycle stage with a small, fast model.
 * Never throws and never blocks the main turn for more than ~1.5s: on any
 * parse failure or timeout, it falls back to the session's previous stage
 * with zero extracted entities.
 */
export async function classifyTurn(params: ClassifyTurnParams): Promise<ClassifierResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const userContent = [
      `Known session state: ${JSON.stringify({
        stage: params.session.stage,
        identity: params.session.identity,
        knownIds: params.session.knownIds,
      })}`,
      '',
      'Recent conversation:',
      formatRecentMessages(params.recentMessages),
    ].join('\n');

    const raw = await params.provider.createJsonCompletion({
      model: params.model,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      signal: controller.signal,
    });

    const result = classifierResultSchema.parse(JSON.parse(raw));
    params.logger.info(
      { stage: result.stage, confidence: result.confidence, durationMs: Date.now() - startedAt },
      'Classifier result',
    );
    return result;
  } catch (err) {
    params.logger.warn(
      { err: err instanceof Error ? err.message : String(err), durationMs: Date.now() - startedAt },
      'Classifier failed or timed out — keeping previous stage',
    );
    return {
      stage: params.session.stage,
      confidence: params.session.stageConfidence,
      entities: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Applies a classifier result to the session: updates stage/confidence and
 * merges any newly extracted entities (normalized) into identity/knownIds,
 * without ever clobbering an already-known value with an absent one.
 */
export function applyClassification(session: SessionState, result: ClassifierResult): void {
  session.stage = result.stage;
  session.stageConfidence = result.confidence;

  const { entities } = result;
  if (entities.phone) {
    session.identity.phone = normalizeIndianPhone(entities.phone);
  }
  if (entities.vehicle_model) {
    session.knownIds.vehicleModel = entities.vehicle_model;
  }
  if (entities.registration_number) {
    session.knownIds.registrationNumber = normalizeRegistrationNumber(entities.registration_number);
  }
  if (entities.booking_id) {
    session.knownIds.bookingId = normalizeBookingId(entities.booking_id);
  }
  if (entities.deal_id) {
    session.knownIds.dealId = entities.deal_id;
  }
}
