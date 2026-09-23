import { z } from 'zod';
import { createContact, findContactByPhone } from '../../zoho/contacts.js';
import { ZohoError, toolErr, toolOk } from '../../utils/errors.js';
import {
  validateEmail,
  validateIndianPhone,
  validateRegistrationNumber,
} from '../../utils/validators.js';
import { defineTool } from './types.js';

const schema = z.object({
  full_name: z.string().min(1).describe('Owner full name'),
  phone: z.string().describe('Owner phone number, any common Indian format'),
  email: z.string().optional().describe('Owner email address, if known'),
  registration_number: z.string().describe('Vehicle registration number'),
});

export interface CreateContactData {
  contactId: string;
  fullName: string;
}

export const createContactTool = defineTool<z.infer<typeof schema>, CreateContactData>({
  name: 'create_contact',
  description:
    'Register a new owner Contact in Zoho CRM. Only use this after create_service_case returns CONTACT_NOT_FOUND and the customer has explicitly confirmed they want to be registered, or when a returning owner cannot be found by phone. Always confirm the details back to the customer before calling this.',
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
    const regResult = validateRegistrationNumber(args.registration_number);
    if (!regResult.valid) {
      return toolErr(
        'INVALID_REGISTRATION_NUMBER',
        regResult.reason,
        'Ask the customer to re-check their registration number.',
      );
    }
    if (args.email) {
      const emailResult = validateEmail(args.email);
      if (!emailResult.valid) {
        return toolErr(
          'INVALID_EMAIL',
          emailResult.reason,
          'Ask the customer to re-check their email address.',
        );
      }
    }

    const existing = await findContactByPhone(ctx.zohoClient, phoneResult.value);
    if (existing) {
      return toolErr(
        'DUPLICATE',
        'A Contact with this phone number already exists.',
        `A customer record already exists (Contact ID ${existing.id}). Use that instead of creating a new one — proceed with create_service_case using this phone number.`,
      );
    }

    try {
      const created = await createContact(ctx.zohoClient, {
        fullName: args.full_name,
        phone: phoneResult.value,
        email: args.email,
        registrationNumber: regResult.value,
      });
      return toolOk({ contactId: created.id, fullName: args.full_name });
    } catch (err) {
      if (err instanceof ZohoError) {
        ctx.logger.error({ code: err.code, message: err.message }, 'create_contact failed in Zoho');
        return toolErr(
          err.code,
          `Zoho rejected the new contact: ${err.message}`,
          'Apologize that registration could not be completed right now and offer to try again shortly.',
        );
      }
      throw err;
    }
  },
});
