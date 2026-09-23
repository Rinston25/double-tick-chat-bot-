import type { LLMMessage } from '../llm/provider.js';

export type Stage =
  'NEW_LEAD' | 'ONGOING_PIPELINE' | 'BOOKED_VEHICLE' | 'POST_PURCHASE_SERVICE' | 'GENERAL';

export interface SessionIdentity {
  phone?: string;
  fullName?: string;
  email?: string;
  contactId?: string;
  leadId?: string;
}

/** Zoho record IDs and other identifiers the conversation has already established, kept across topic switches. */
export interface SessionKnownIds {
  dealId?: string;
  bookingId?: string;
  caseId?: string;
  registrationNumber?: string;
  vehicleModel?: string;
  preferredCity?: string;
}

export interface SessionState {
  sessionId: string;
  stage: Stage;
  stageConfidence: number;
  identity: SessionIdentity;
  knownIds: SessionKnownIds;
  /** Full persisted conversation (system prompt excluded — rebuilt fresh every turn). */
  messages: LLMMessage[];
  createdAt: number;
  updatedAt: number;
}

export const SESSION_TTL_SECONDS = 2 * 60 * 60; // 2 hours

export function createEmptySession(sessionId: string): SessionState {
  const now = Date.now();
  return {
    sessionId,
    stage: 'GENERAL',
    stageConfidence: 0,
    identity: {},
    knownIds: {},
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface SessionStore {
  get(sessionId: string): Promise<SessionState | null>;
  set(state: SessionState): Promise<void>;
  delete(sessionId: string): Promise<void>;
}
