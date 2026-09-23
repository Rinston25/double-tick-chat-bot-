import { z } from 'zod';
import { findContactByPhone } from '../../zoho/contacts.js';
import { findLeadByPhone } from '../../zoho/leads.js';
import { findDealsByContactId, bookedDeals, openDeals } from '../../zoho/deals.js';
import { toolErr, toolOk } from '../../utils/errors.js';
import { validateIndianPhone } from '../../utils/validators.js';
import { defineTool } from './types.js';

const schema = z.object({
  phone: z.string().describe('Customer phone number, any common Indian format'),
});

export interface FindCustomerData {
  phone: string;
  contact: { id: string; name: string; registrationNumber: string | null } | null;
  lead: { id: string; name: string; vehicleModel: string | null } | null;
  openDeals: Array<{ id: string; dealName: string | null; stage: string | null }>;
  bookedDeals: Array<{ id: string; dealName: string | null; stage: string | null }>;
}

export const findCustomerTool = defineTool<z.infer<typeof schema>, FindCustomerData>({
  name: 'find_customer',
  description:
    'Look up an existing customer by phone number across Contacts, Leads, and Deals. Use this to figure out whether someone is a brand-new visitor, an existing prospect, an owner, or already has a booking, before deciding what to do next.',
  schema,
  async execute(args, ctx) {
    const validated = validateIndianPhone(args.phone);
    if (!validated.valid) {
      return toolErr(
        'INVALID_PHONE',
        validated.reason,
        'Ask the customer for a valid 10-digit Indian mobile number.',
      );
    }
    const phone = validated.value;

    const [contact, lead] = await Promise.all([
      findContactByPhone(ctx.zohoClient, phone),
      findLeadByPhone(ctx.zohoClient, phone),
    ]);

    const deals = contact ? await findDealsByContactId(ctx.zohoClient, contact.id) : [];

    return toolOk({
      phone,
      contact: contact
        ? {
            id: contact.id,
            name: `${contact.firstName} ${contact.lastName}`.trim(),
            registrationNumber: contact.registrationNumber,
          }
        : null,
      lead: lead
        ? {
            id: lead.id,
            name: `${lead.firstName} ${lead.lastName}`.trim(),
            vehicleModel: lead.vehicleModel,
          }
        : null,
      openDeals: openDeals(deals).map((d) => ({ id: d.id, dealName: d.dealName, stage: d.stage })),
      bookedDeals: bookedDeals(deals).map((d) => ({
        id: d.id,
        dealName: d.dealName,
        stage: d.stage,
      })),
    });
  },
});
