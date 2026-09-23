import {
  CLOSED_DEAL_STAGES,
  DEAL_FIELDS,
  DEAL_STAGES,
  ZOHO_MODULES,
} from '../config/zohoFields.js';
import { normalizeBookingId } from '../utils/validators.js';
import type { ZohoClient, ZohoRecordResult } from './client.js';
import { firstRecordOrThrow } from './recordResult.js';

export interface ZohoDeal {
  id: string;
  dealName: string | null;
  stage: string | null;
  contactId: string | null;
  vehicleModel: string | null;
  variant: string | null;
  testDriveDate: string | null;
  quotationAmount: number | null;
  dealerName: string | null;
  dealerPhone: string | null;
  followUpPreference: string | null;
  followUpTime: string | null;
  bookingId: string | null;
  allocationStatus: string | null;
  vin: string | null;
  expectedDeliveryDate: string | null;
  balancePaymentLink: string | null;
}

interface RawDealRecord {
  id: string;
  [key: string]: unknown;
}

function mapDeal(raw: RawDealRecord): ZohoDeal {
  const contactName = raw[DEAL_FIELDS.contactName] as { id?: string } | undefined;
  return {
    id: raw.id,
    dealName: (raw[DEAL_FIELDS.dealName] as string) ?? null,
    stage: (raw[DEAL_FIELDS.stage] as string) ?? null,
    contactId: contactName?.id ?? null,
    vehicleModel: (raw[DEAL_FIELDS.vehicleModel] as string) ?? null,
    variant: (raw[DEAL_FIELDS.variant] as string) ?? null,
    testDriveDate: (raw[DEAL_FIELDS.testDriveDate] as string) ?? null,
    quotationAmount: (raw[DEAL_FIELDS.quotationAmount] as number) ?? null,
    dealerName: (raw[DEAL_FIELDS.dealerName] as string) ?? null,
    dealerPhone: (raw[DEAL_FIELDS.dealerPhone] as string) ?? null,
    followUpPreference: (raw[DEAL_FIELDS.followUpPreference] as string) ?? null,
    followUpTime: (raw[DEAL_FIELDS.followUpTime] as string) ?? null,
    bookingId: (raw[DEAL_FIELDS.bookingId] as string) ?? null,
    allocationStatus: (raw[DEAL_FIELDS.allocationStatus] as string) ?? null,
    vin: (raw[DEAL_FIELDS.vin] as string) ?? null,
    expectedDeliveryDate: (raw[DEAL_FIELDS.expectedDeliveryDate] as string) ?? null,
    balancePaymentLink: (raw[DEAL_FIELDS.balancePaymentLink] as string) ?? null,
  };
}

/** Deals related to a Contact, via the Contacts -> Deals related list. */
/** Zoho's related-list endpoint (unlike a direct record GET) requires an explicit `fields` param. */
const DEAL_RELATED_LIST_FIELDS = Object.values(DEAL_FIELDS).join(',');

export async function findDealsByContactId(
  client: ZohoClient,
  contactId: string,
): Promise<ZohoDeal[]> {
  const response = await client.get<{ data?: RawDealRecord[] } | undefined>(
    `/${ZOHO_MODULES.contacts}/${contactId}/${ZOHO_MODULES.deals}`,
    { fields: DEAL_RELATED_LIST_FIELDS },
  );
  return (response?.data ?? []).map(mapDeal);
}

export async function findDealById(client: ZohoClient, dealId: string): Promise<ZohoDeal | null> {
  const response = await client.get<{ data?: RawDealRecord[] } | undefined>(
    `/${ZOHO_MODULES.deals}/${dealId}`,
  );
  const raw = response?.data?.[0];
  return raw ? mapDeal(raw) : null;
}

export async function findDealsByBookingId(
  client: ZohoClient,
  bookingIdRaw: string,
): Promise<ZohoDeal[]> {
  const bookingId = normalizeBookingId(bookingIdRaw);
  const criteria = `(${DEAL_FIELDS.bookingId}:equals:${bookingId})`;
  const raw = await client.search<RawDealRecord>(ZOHO_MODULES.deals, { criteria });
  return raw.map(mapDeal);
}

/** Non-closed deals (excludes any stage in CLOSED_DEAL_STAGES, e.g. Closed Won / Closed Lost). */
export function openDeals(deals: ZohoDeal[]): ZohoDeal[] {
  return deals.filter((d) => d.stage && !CLOSED_DEAL_STAGES.includes(d.stage));
}

/** Deals that have reached the booking stage. */
export function bookedDeals(deals: ZohoDeal[]): ZohoDeal[] {
  return deals.filter((d) => d.stage === DEAL_STAGES.closedWonBooked);
}

export interface UpdateDealFollowupInput {
  dealId: string;
  followUpPreference: string;
  followUpTime?: string;
  notes?: string;
}

export async function updateDealFollowup(
  client: ZohoClient,
  input: UpdateDealFollowupInput,
): Promise<ZohoDeal> {
  const record: Record<string, unknown> = {
    [DEAL_FIELDS.followUpPreference]: input.followUpPreference,
  };
  if (input.followUpTime) record[DEAL_FIELDS.followUpTime] = input.followUpTime;
  if (input.notes) record[DEAL_FIELDS.description] = input.notes;

  const response = await client.put<{ data: ZohoRecordResult[] }>(
    `/${ZOHO_MODULES.deals}/${input.dealId}`,
    { data: [record] },
  );
  firstRecordOrThrow(response);

  const updated = await findDealById(client, input.dealId);
  if (!updated) {
    throw new Error(`Deal ${input.dealId} not found after update`);
  }
  return updated;
}
