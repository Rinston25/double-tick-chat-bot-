import { CONTACT_FIELDS, ZOHO_MODULES } from '../config/zohoFields.js';
import { normalizeIndianPhone, splitFullName } from '../utils/validators.js';
import type { ZohoClient, ZohoRecordResult } from './client.js';
import { firstRecordOrThrow, recordId } from './recordResult.js';

export interface ZohoContact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  registrationNumber: string | null;
}

interface RawContactRecord {
  id: string;
  [CONTACT_FIELDS.firstName]?: string;
  [CONTACT_FIELDS.lastName]?: string;
  [CONTACT_FIELDS.phone]?: string;
  [CONTACT_FIELDS.mobile]?: string;
  [CONTACT_FIELDS.email]?: string;
  [CONTACT_FIELDS.registrationNumber]?: string;
}

function mapContact(raw: RawContactRecord): ZohoContact {
  return {
    id: raw.id,
    firstName: raw[CONTACT_FIELDS.firstName] ?? '',
    lastName: raw[CONTACT_FIELDS.lastName] ?? '',
    phone: raw[CONTACT_FIELDS.phone] ?? null,
    mobile: raw[CONTACT_FIELDS.mobile] ?? null,
    email: raw[CONTACT_FIELDS.email] ?? null,
    registrationNumber: raw[CONTACT_FIELDS.registrationNumber] ?? null,
  };
}

/**
 * Finds a Contact by 10-digit Indian mobile number. Tries the bare 10-digit
 * form first, then the +91-prefixed form, since different orgs store phone
 * numbers differently.
 */
export async function findContactByPhone(
  client: ZohoClient,
  normalizedPhone: string,
): Promise<ZohoContact | null> {
  const bare = await client.search<RawContactRecord>(ZOHO_MODULES.contacts, {
    phone: normalizedPhone,
  });
  if (bare.length > 0) return mapContact(bare[0] as RawContactRecord);

  const withCountryCode = await client.search<RawContactRecord>(ZOHO_MODULES.contacts, {
    phone: `+91${normalizedPhone}`,
  });
  if (withCountryCode.length > 0) return mapContact(withCountryCode[0] as RawContactRecord);

  return null;
}

export async function createContact(
  client: ZohoClient,
  input: { fullName: string; phone: string; email?: string; registrationNumber?: string },
): Promise<{ id: string }> {
  const { firstName, lastName } = splitFullName(input.fullName);
  const normalizedPhone = normalizeIndianPhone(input.phone);

  const record: Record<string, unknown> = {
    [CONTACT_FIELDS.firstName]: firstName,
    [CONTACT_FIELDS.lastName]: lastName || input.fullName,
    [CONTACT_FIELDS.phone]: normalizedPhone,
    [CONTACT_FIELDS.mobile]: normalizedPhone,
  };
  if (input.email) record[CONTACT_FIELDS.email] = input.email;
  if (input.registrationNumber)
    record[CONTACT_FIELDS.registrationNumber] = input.registrationNumber;

  const response = await client.post<{ data: ZohoRecordResult[] }>(`/${ZOHO_MODULES.contacts}`, {
    data: [record],
  });
  const result = firstRecordOrThrow(response);
  return { id: recordId(result) };
}
