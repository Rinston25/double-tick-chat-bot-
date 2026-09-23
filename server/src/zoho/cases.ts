import { CASE_DEFAULTS, CASE_FIELDS, ZOHO_MODULES } from '../config/zohoFields.js';
import type { ZohoClient, ZohoRecordResult } from './client.js';
import { firstRecordOrThrow, recordId } from './recordResult.js';

export interface CreateCaseInput {
  contactId: string;
  registrationNumber: string;
  odometerKm: number;
  serviceType: string;
  issueDescription: string;
  preferredServiceCenter: string;
  vehicleModel?: string;
}

export async function createServiceCase(
  client: ZohoClient,
  input: CreateCaseInput,
): Promise<{ id: string }> {
  const record: Record<string, unknown> = {
    [CASE_FIELDS.subject]: `${input.serviceType} — ${input.registrationNumber}`,
    [CASE_FIELDS.status]: CASE_DEFAULTS.status,
    [CASE_FIELDS.priority]: CASE_DEFAULTS.priority,
    [CASE_FIELDS.caseOrigin]: CASE_DEFAULTS.caseOrigin,
    [CASE_FIELDS.description]: input.issueDescription,
    [CASE_FIELDS.contactName]: { id: input.contactId },
    [CASE_FIELDS.registrationNumber]: input.registrationNumber,
    [CASE_FIELDS.odometerReading]: input.odometerKm,
    [CASE_FIELDS.serviceType]: input.serviceType,
    [CASE_FIELDS.preferredServiceCenter]: input.preferredServiceCenter,
  };
  if (input.vehicleModel) record[CASE_FIELDS.vehicleModel] = input.vehicleModel;

  const response = await client.post<{ data: ZohoRecordResult[] }>(`/${ZOHO_MODULES.cases}`, {
    data: [record],
  });
  const result = firstRecordOrThrow(response);
  return { id: recordId(result) };
}
