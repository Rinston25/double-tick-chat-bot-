import { z } from 'zod';
import { findContactByPhone } from '../../zoho/contacts.js';
import { findDealById, findDealsByContactId, openDeals, type ZohoDeal } from '../../zoho/deals.js';
import { toolErr, toolOk } from '../../utils/errors.js';
import {
  formatIndianRupees,
  formatIstDateTime,
  validateIndianPhone,
} from '../../utils/validators.js';
import { defineTool } from './types.js';

const schema = z
  .object({
    phone: z.string().optional().describe('Customer phone number, any common Indian format'),
    deal_id: z
      .string()
      .optional()
      .describe('Zoho Deal record ID, if already known from earlier in the conversation'),
  })
  .refine((v) => v.phone || v.deal_id, { message: 'At least one of phone or deal_id is required' });

export interface DealStatusData {
  dealId: string;
  dealName: string | null;
  stage: string | null;
  vehicleModel: string | null;
  variant: string | null;
  testDriveDateFormatted: string | null;
  quotationFormatted: string | null;
  dealerName: string | null;
  dealerPhone: string | null;
  followUpPreference: string | null;
}

function toDealStatusData(deal: ZohoDeal): DealStatusData {
  return {
    dealId: deal.id,
    dealName: deal.dealName,
    stage: deal.stage,
    vehicleModel: deal.vehicleModel,
    variant: deal.variant,
    testDriveDateFormatted: deal.testDriveDate ? formatIstDateTime(deal.testDriveDate) : null,
    quotationFormatted: deal.quotationAmount ? formatIndianRupees(deal.quotationAmount) : null,
    dealerName: deal.dealerName,
    dealerPhone: deal.dealerPhone,
    followUpPreference: deal.followUpPreference,
  };
}

export const getDealStatusTool = defineTool<z.infer<typeof schema>, DealStatusData[]>({
  name: 'get_deal_status',
  description:
    'Fetch the open (non-closed) pipeline Deal(s) for an existing prospect — test drive date, quotation, dealer contact. Use when a known customer asks about their test drive confirmation, quote, or dealer. Provide phone or a previously-known deal_id.',
  schema,
  async execute(args, ctx) {
    if (args.deal_id) {
      const deal = await findDealById(ctx.zohoClient, args.deal_id);
      if (!deal) {
        return toolErr(
          'DEAL_NOT_FOUND',
          `No Deal found with ID ${args.deal_id}.`,
          'Ask the customer to double check the ID, or offer to look them up by phone number instead.',
        );
      }
      return toolOk([toDealStatusData(deal)]);
    }

    const phoneResult = validateIndianPhone(args.phone as string);
    if (!phoneResult.valid) {
      return toolErr(
        'INVALID_PHONE',
        phoneResult.reason,
        'Ask the customer for a valid 10-digit Indian mobile number.',
      );
    }

    const contact = await findContactByPhone(ctx.zohoClient, phoneResult.value);
    if (!contact) {
      return toolErr(
        'CUSTOMER_NOT_FOUND',
        'No customer record found for this phone number.',
        'Politely tell the customer we could not find an existing enquiry under this number, and offer to start a new one (get_vehicle_info / create_lead) or double-check the number.',
      );
    }

    const deals = openDeals(await findDealsByContactId(ctx.zohoClient, contact.id));
    if (deals.length === 0) {
      return toolErr(
        'NO_OPEN_DEAL',
        'This customer has no open pipeline deal.',
        'Let the customer know there is no active test drive/quotation in progress right now, and ask how you can help (e.g. a new enquiry, or checking on a booking instead).',
      );
    }

    return toolOk(deals.map(toDealStatusData));
  },
});
