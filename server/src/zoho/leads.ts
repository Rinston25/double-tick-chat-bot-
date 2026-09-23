import { LEAD_FIELDS, LEAD_SOURCE_VALUE, ZOHO_MODULES } from '../config/zohoFields.js';
import { normalizeIndianPhone, splitFullName } from '../utils/validators.js';
import type { ZohoClient, ZohoRecordResult } from './client.js';
import { firstRecordOrThrow, recordId } from './recordResult.js';

export interface ZohoLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  vehicleModel: string | null;
}

interface RawLeadRecord {
  id: string;
  [LEAD_FIELDS.firstName]?: string;
  [LEAD_FIELDS.lastName]?: string;
  [LEAD_FIELDS.phone]?: string;
  [LEAD_FIELDS.email]?: string;
  [LEAD_FIELDS.city]?: string;
  [LEAD_FIELDS.vehicleModel]?: string;
}

function mapLead(raw: RawLeadRecord): ZohoLead {
  return {
    id: raw.id,
    firstName: raw[LEAD_FIELDS.firstName] ?? '',
    lastName: raw[LEAD_FIELDS.lastName] ?? '',
    phone: raw[LEAD_FIELDS.phone] ?? null,
    email: raw[LEAD_FIELDS.email] ?? null,
    city: raw[LEAD_FIELDS.city] ?? null,
    vehicleModel: raw[LEAD_FIELDS.vehicleModel] ?? null,
  };
}

export async function findLeadByPhone(
  client: ZohoClient,
  normalizedPhone: string,
): Promise<ZohoLead | null> {
  const bare = await client.search<RawLeadRecord>(ZOHO_MODULES.leads, { phone: normalizedPhone });
  if (bare.length > 0) return mapLead(bare[0] as RawLeadRecord);

  const withCountryCode = await client.search<RawLeadRecord>(ZOHO_MODULES.leads, {
    phone: `+91${normalizedPhone}`,
  });
  if (withCountryCode.length > 0) return mapLead(withCountryCode[0] as RawLeadRecord);

  return null;
}

export interface CreateLeadInput {
  fullName: string;
  phone: string;
  email: string;
  preferredCity: string;
  vehicleModel: string;
  testDriveRequested: boolean;
}

export async function createLead(
  client: ZohoClient,
  input: CreateLeadInput,
): Promise<{ id: string }> {
  const { firstName, lastName } = splitFullName(input.fullName);
  const normalizedPhone = normalizeIndianPhone(input.phone);

  const record: Record<string, unknown> = {
    [LEAD_FIELDS.firstName]: firstName,
    [LEAD_FIELDS.lastName]: lastName || input.fullName,
    [LEAD_FIELDS.phone]: normalizedPhone,
    [LEAD_FIELDS.email]: input.email,
    [LEAD_FIELDS.city]: input.preferredCity,
    [LEAD_FIELDS.preferredCity]: input.preferredCity,
    [LEAD_FIELDS.leadSource]: LEAD_SOURCE_VALUE,
    [LEAD_FIELDS.vehicleModel]: input.vehicleModel,
    [LEAD_FIELDS.testDriveRequested]: input.testDriveRequested,
    [LEAD_FIELDS.description]: `Captured via Mahindra AI Chat Agent. Interested in ${input.vehicleModel}.${
      input.testDriveRequested ? ' Requested a test drive.' : ''
    }`,
  };

  const response = await client.post<{ data: ZohoRecordResult[] }>(`/${ZOHO_MODULES.leads}`, {
    data: [record],
  });
  const result = firstRecordOrThrow(response);
  return { id: recordId(result) };
}
