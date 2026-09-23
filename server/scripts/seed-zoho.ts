/**
 * Idempotent Zoho CRM seed script for the demo dataset described in the
 * take-home brief. Safe to re-run: every record is searched for first and
 * only created if missing.
 *
 * Usage: npm run seed
 */
import pino from 'pino';
import { DEAL_FIELDS, DEAL_STAGES, ZOHO_MODULES } from '../src/config/zohoFields.js';
import { ZohoClient } from '../src/zoho/client.js';
import { ZohoTokenManager } from '../src/zoho/auth.js';
import { findContactByPhone, createContact } from '../src/zoho/contacts.js';
import { findLeadByPhone, createLead } from '../src/zoho/leads.js';
import { requireFullZohoEnv } from './lib/loadZohoEnv.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

interface ResultRow {
  module: string;
  name: string;
  id: string;
  status: 'created' | 'existing';
}

const rows: ResultRow[] = [];

function istDatePart(daysFromNow: number): string {
  const target = new Date(Date.now() + daysFromNow * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
}

function istDateTime(daysFromNow: number, hh: string, mm: string): string {
  return `${istDatePart(daysFromNow)}T${hh}:${mm}:00+05:30`;
}

async function findDealByName(
  client: ZohoClient,
  dealName: string,
): Promise<{ id: string } | null> {
  const criteria = `(${DEAL_FIELDS.dealName}:equals:${dealName})`;
  const results = await client.search<{ id: string }>(ZOHO_MODULES.deals, { criteria });
  return results[0] ?? null;
}

async function createDeal(client: ZohoClient, record: Record<string, unknown>): Promise<string> {
  const response = await client.post<{
    data: Array<{ code: string; message: string; status: string; details?: { id?: string } }>;
  }>(`/${ZOHO_MODULES.deals}`, { data: [record] });
  const first = response.data[0];
  if (!first || first.status !== 'success' || !first.details?.id) {
    throw new Error(`Failed to create Deal "${record[DEAL_FIELDS.dealName]}": ${first?.message}`);
  }
  return first.details.id;
}

async function seedLead(client: ZohoClient) {
  const phone = '9876543210';
  const existing = await findLeadByPhone(client, phone);
  if (existing) {
    rows.push({ module: 'Leads', name: 'Rajesh Sharma', id: existing.id, status: 'existing' });
    return;
  }
  const created = await createLead(client, {
    fullName: 'Rajesh Sharma',
    phone,
    email: 'rajesh.sharma@example.com',
    preferredCity: 'Pune',
    vehicleModel: 'Thar',
    testDriveRequested: true,
  });
  rows.push({ module: 'Leads', name: 'Rajesh Sharma', id: created.id, status: 'created' });
}

async function seedPriyaPatel(client: ZohoClient) {
  const phone = '9123456780';
  let contact = await findContactByPhone(client, phone);
  let contactStatus: 'created' | 'existing' = 'existing';
  if (!contact) {
    const created = await createContact(client, { fullName: 'Priya Patel', phone });
    contact = {
      id: created.id,
      firstName: 'Priya',
      lastName: 'Patel',
      phone,
      mobile: phone,
      email: null,
      registrationNumber: null,
    };
    contactStatus = 'created';
  }
  rows.push({ module: 'Contacts', name: 'Priya Patel', id: contact.id, status: contactStatus });

  const dealName = 'Priya Patel - XUV700 AX7';
  const existingDeal = await findDealByName(client, dealName);
  if (existingDeal) {
    rows.push({ module: 'Deals', name: dealName, id: existingDeal.id, status: 'existing' });
    return;
  }
  const dealId = await createDeal(client, {
    [DEAL_FIELDS.dealName]: dealName,
    [DEAL_FIELDS.stage]: DEAL_STAGES.testDriveScheduled,
    [DEAL_FIELDS.closingDate]: istDatePart(14),
    [DEAL_FIELDS.amount]: 1_699_000,
    [DEAL_FIELDS.contactName]: { id: contact.id },
    [DEAL_FIELDS.vehicleModel]: 'XUV700',
    [DEAL_FIELDS.variant]: 'AX7',
    [DEAL_FIELDS.testDriveDate]: istDateTime(2, '11', '00'),
    [DEAL_FIELDS.quotationAmount]: 1_699_000,
    [DEAL_FIELDS.dealerName]: 'Mahindra Autocraft, Andheri',
    [DEAL_FIELDS.dealerPhone]: '+91 98200 12345',
    [DEAL_FIELDS.followUpPreference]: 'WhatsApp',
  });
  rows.push({ module: 'Deals', name: dealName, id: dealId, status: 'created' });
}

async function seedAmitVerma(client: ZohoClient) {
  const phone = '9988776655';
  let contact = await findContactByPhone(client, phone);
  let contactStatus: 'created' | 'existing' = 'existing';
  if (!contact) {
    const created = await createContact(client, { fullName: 'Amit Verma', phone });
    contact = {
      id: created.id,
      firstName: 'Amit',
      lastName: 'Verma',
      phone,
      mobile: phone,
      email: null,
      registrationNumber: null,
    };
    contactStatus = 'created';
  }
  rows.push({ module: 'Contacts', name: 'Amit Verma', id: contact.id, status: contactStatus });

  const dealName = 'Amit Verma - Scorpio-N Z8L';
  const existingDeal = await findDealByName(client, dealName);
  if (existingDeal) {
    rows.push({ module: 'Deals', name: dealName, id: existingDeal.id, status: 'existing' });
    return;
  }
  const dealId = await createDeal(client, {
    [DEAL_FIELDS.dealName]: dealName,
    [DEAL_FIELDS.stage]: DEAL_STAGES.closedWonBooked,
    [DEAL_FIELDS.closingDate]: istDatePart(-3),
    [DEAL_FIELDS.amount]: 2_450_000,
    [DEAL_FIELDS.contactName]: { id: contact.id },
    [DEAL_FIELDS.vehicleModel]: 'Scorpio-N',
    [DEAL_FIELDS.variant]: 'Z8L',
    [DEAL_FIELDS.bookingId]: 'MAH-9921',
    [DEAL_FIELDS.allocationStatus]: 'In Transit',
    [DEAL_FIELDS.vin]: 'MA1TA2XXXXX123456',
    [DEAL_FIELDS.expectedDeliveryDate]: istDatePart(10),
    [DEAL_FIELDS.balancePaymentLink]: 'https://example.com/pay/MAH-9921',
  });
  rows.push({ module: 'Deals', name: dealName, id: dealId, status: 'created' });
}

async function seedSnehaIyer(client: ZohoClient) {
  const phone = '9001122334';
  const existing = await findContactByPhone(client, phone);
  if (existing) {
    rows.push({ module: 'Contacts', name: 'Sneha Iyer', id: existing.id, status: 'existing' });
    return;
  }
  const created = await createContact(client, {
    fullName: 'Sneha Iyer',
    phone,
    registrationNumber: 'MH02AB1234',
  });
  rows.push({
    module: 'Contacts',
    name: 'Sneha Iyer (XUV700 owner)',
    id: created.id,
    status: 'created',
  });
}

function printTable() {
  const header = ['Module', 'Name', 'Status', 'Zoho ID'];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(Object.values(r)[i]).length)),
  );
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  |  ');
  console.log('\n' + line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('--|--'));
  for (const r of rows) {
    console.log(line([r.module, r.name, r.status, r.id]));
  }
  console.log('');
}

async function main() {
  const env = requireFullZohoEnv();
  const tokenManager = new ZohoTokenManager({
    accountsUrl: env.accountsUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    refreshToken: env.refreshToken,
    logger,
  });
  const client = new ZohoClient({
    apiDomain: env.apiDomain,
    apiVersion: env.apiVersion,
    tokenManager,
    logger,
  });

  console.log('Seeding Zoho CRM demo data (idempotent — safe to re-run)...');

  await seedLead(client);
  await seedPriyaPatel(client);
  await seedAmitVerma(client);
  await seedSnehaIyer(client);

  printTable();
  console.log('Done. Use these phone numbers / booking IDs in the demo:');
  console.log('  Rajesh Sharma  (new lead)          9876543210');
  console.log('  Priya Patel    (test drive booked) 9123456780');
  console.log('  Amit Verma     (vehicle booked)    9988776655 / MAH-9921');
  console.log('  Sneha Iyer     (owner, service)    9001122334 / MH02AB1234\n');
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
