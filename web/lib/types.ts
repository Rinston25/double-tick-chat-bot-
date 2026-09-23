export type Stage =
  'NEW_LEAD' | 'ONGOING_PIPELINE' | 'BOOKED_VEHICLE' | 'POST_PURCHASE_SERVICE' | 'GENERAL';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  isError?: boolean;
}

export type CrmActivityStatus = 'pending' | 'ok' | 'error';

export interface CrmActivityEntry {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: CrmActivityStatus;
  summary?: string;
}

export interface SessionDetails {
  sessionId: string;
  stage: Stage;
  stageConfidence: number;
  identity: {
    phone?: string;
    fullName?: string;
    email?: string;
    contactId?: string;
    leadId?: string;
  };
  knownIds: {
    dealId?: string;
    bookingId?: string;
    caseId?: string;
    registrationNumber?: string;
    vehicleModel?: string;
    preferredCity?: string;
  };
  messageCount: number;
  updatedAt: number;
}

export type SseEvent =
  | { type: 'stage'; data: { stage: Stage; confidence: number } }
  | { type: 'token'; data: { text: string } }
  | { type: 'tool_start'; data: { id: string; name: string; args: Record<string, unknown> } }
  | { type: 'tool_end'; data: { id: string; name: string; ok: boolean; summary: string } }
  | { type: 'error'; data: { message: string } }
  | { type: 'done'; data: Record<string, never> };

export const STAGE_LABELS: Record<Stage, string> = {
  NEW_LEAD: 'New Lead',
  ONGOING_PIPELINE: 'Ongoing Pipeline',
  BOOKED_VEHICLE: 'Booked Vehicle',
  POST_PURCHASE_SERVICE: 'Post-Purchase Service',
  GENERAL: 'General',
};
