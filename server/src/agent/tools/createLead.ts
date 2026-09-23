import { z } from 'zod';
import { VEHICLE_MODELS } from '../../config/zohoFields.js';
import { findContactByPhone } from '../../zoho/contacts.js';
import { createLead, findLeadByPhone } from '../../zoho/leads.js';
import { ZohoError } from '../../utils/errors.js';
import { toolErr, toolOk } from '../../utils/errors.js';
import { validateEmail, validateIndianPhone } from '../../utils/validators.js';
import { defineTool } from './types.js';

const schema = z.object({
  full_name: z.string().min(1).describe('Customer full name'),
  phone: z.string().describe('Customer phone number, any common Indian format'),
  email: z.string().describe('Customer email address'),
  preferred_city: z.string().min(1).describe('City where the customer wants to test drive / buy'),
  vehicle_model: z.enum(VEHICLE_MODELS).describe('Vehicle model the customer is interested in'),
  test_drive_requested: z.boolean().describe('Whether the customer asked for a test drive'),
});

export interface CreateLeadData {
  leadId: string;
  fullName: string;
  vehicleModel: string;
}

export interface DuplicateLeadData {
  existingType: 'lead' | 'contact';
  existingId: string;
}

export const createLeadTool = defineTool<
  z.infer<typeof schema>,
  CreateLeadData | DuplicateLeadData
>({
  name: 'create_lead',
  description:
    'Create a new Lead in Zoho CRM for an unidentified visitor interested in a vehicle, after collecting their full name, phone, email, and preferred city, and after the customer has explicitly confirmed the summary. Automatically checks for an existing Lead or Contact with the same phone number first to avoid duplicates.',
  schema,
  async execute(args, ctx) {
    const phoneResult = validateIndianPhone(args.phone);
    if (!phoneResult.valid) {
      return toolErr(
        'INVALID_PHONE',
        phoneResult.reason,
        'Ask the customer to re-check their phone number.',
      );
    }
    const emailResult = validateEmail(args.email);
    if (!emailResult.valid) {
      return toolErr(
        'INVALID_EMAIL',
        emailResult.reason,
        'Ask the customer to re-check their email address.',
      );
    }

    const [existingContact, existingLead] = await Promise.all([
      findContactByPhone(ctx.zohoClient, phoneResult.value),
      findLeadByPhone(ctx.zohoClient, phoneResult.value),
    ]);

    if (existingContact) {
      return toolErr(
        'DUPLICATE',
        'A Contact with this phone number already exists.',
        `A customer record already exists (Contact ID ${existingContact.id}). Do not create a new Lead — instead use find_customer or get_deal_status to help them with their existing relationship.`,
      );
    }
    if (existingLead) {
      return toolErr(
        'DUPLICATE',
        'A Lead with this phone number already exists.',
        `A Lead already exists for this phone number (Lead ID ${existingLead.id}). Do not create a duplicate — let the customer know we already have their details on file and offer to continue with the existing enquiry.`,
      );
    }

    try {
      const created = await createLead(ctx.zohoClient, {
        fullName: args.full_name,
        phone: phoneResult.value,
        email: emailResult.value,
        preferredCity: args.preferred_city,
        vehicleModel: args.vehicle_model,
        testDriveRequested: args.test_drive_requested,
      });
      return toolOk({
        leadId: created.id,
        fullName: args.full_name,
        vehicleModel: args.vehicle_model,
      });
    } catch (err) {
      if (err instanceof ZohoError) {
        ctx.logger.error({ code: err.code, message: err.message }, 'create_lead failed in Zoho');
        return toolErr(
          err.code,
          `Zoho rejected the Lead: ${err.message}`,
          'Apologize that the enquiry could not be saved right now and offer to try again in a moment, or take down details for manual follow-up.',
        );
      }
      throw err;
    }
  },
});
