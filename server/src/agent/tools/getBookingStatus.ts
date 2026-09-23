import { z } from 'zod';
import { findContactByPhone } from '../../zoho/contacts.js';
import {
  bookedDeals,
  findDealsByBookingId,
  findDealsByContactId,
  type ZohoDeal,
} from '../../zoho/deals.js';
import { toolErr, toolOk } from '../../utils/errors.js';
import {
  formatIstDate,
  normalizeBookingId,
  validateBookingId,
  validateIndianPhone,
} from '../../utils/validators.js';
import { defineTool } from './types.js';

const schema = z
  .object({
    booking_id: z
      .string()
      .optional()
      .describe('Booking ID, e.g. "MAH-9921" (flexible formats accepted)'),
    phone: z.string().optional().describe('Customer phone number, any common Indian format'),
  })
  .refine((v) => v.booking_id || v.phone, {
    message: 'At least one of booking_id or phone is required',
  });

export interface BookingStatusData {
  dealId: string;
  bookingId: string | null;
  vehicleModel: string | null;
  variant: string | null;
  allocationStatus: string | null;
  vin: string;
  expectedDeliveryFormatted: string | null;
  balancePaymentLink: string | null;
}

function toBookingStatusData(d: ZohoDeal): BookingStatusData {
  return {
    dealId: d.id,
    bookingId: d.bookingId,
    vehicleModel: d.vehicleModel,
    variant: d.variant,
    allocationStatus: d.allocationStatus,
    vin: d.vin ?? 'not yet allocated',
    expectedDeliveryFormatted: d.expectedDeliveryDate
      ? formatIstDate(d.expectedDeliveryDate)
      : null,
    balancePaymentLink: d.balancePaymentLink,
  };
}

export const getBookingStatusTool = defineTool<z.infer<typeof schema>, BookingStatusData[]>({
  name: 'get_booking_status',
  description:
    'Look up a confirmed vehicle booking (a closed-won Deal) by Booking ID or phone number. Returns VIN allocation status, expected delivery, and the balance payment link. Use this for delivery timeline / VIN / payment link questions from a customer who has already booked and paid a booking amount.',
  schema,
  async execute(args, ctx) {
    if (args.booking_id) {
      const validated = validateBookingId(args.booking_id);
      if (!validated.valid) {
        return toolErr(
          'INVALID_BOOKING_ID',
          validated.reason,
          'Ask the customer to re-check the booking ID format MAH-XXXX.',
        );
      }
      const deals = bookedDeals(await findDealsByBookingId(ctx.zohoClient, validated.value));
      if (deals.length === 0) {
        return toolErr(
          'BOOKING_NOT_FOUND',
          `No confirmed booking found for ${normalizeBookingId(args.booking_id)}.`,
          'Ask the customer to double-check the booking ID (format MAH-XXXX), or offer to look it up by phone number instead.',
        );
      }
      return toolOk(deals.map(toBookingStatusData));
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
        'Let the customer know we could not find a booking under this number, and ask them to double check it or provide the booking ID instead.',
      );
    }
    const deals = bookedDeals(await findDealsByContactId(ctx.zohoClient, contact.id));
    if (deals.length === 0) {
      return toolErr(
        'BOOKING_NOT_FOUND',
        'No confirmed booking found for this customer.',
        'Let the customer know there is no confirmed booking under this number yet, and ask how else you can help.',
      );
    }
    return toolOk(deals.map(toBookingStatusData));
  },
});
