import { z } from 'zod';
import { SERVICE_TYPES, VEHICLE_MODELS } from '../../config/zohoFields.js';
import { findContactByPhone } from '../../zoho/contacts.js';
import { createServiceCase } from '../../zoho/cases.js';
import { ZohoError, toolErr, toolOk } from '../../utils/errors.js';
import {
  validateIndianPhone,
  validateOdometer,
  validateRegistrationNumber,
} from '../../utils/validators.js';
import { defineTool } from './types.js';

const schema = z.object({
  phone: z.string().describe('Owner phone number, any common Indian format'),
  registration_number: z.string().describe('Vehicle registration number'),
  odometer_km: z.number().int().describe('Current odometer reading in kilometers'),
  service_type: z.enum(SERVICE_TYPES).describe('Type of service being requested'),
  issue_description: z
    .string()
    .min(1)
    .describe('Description of the issue or service request, in the customer’s words'),
  preferred_service_center: z
    .string()
    .min(1)
    .describe('Preferred workshop / service center name or location'),
  vehicle_model: z.enum(VEHICLE_MODELS).optional().describe('Vehicle model, if known'),
});

export interface CreateServiceCaseData {
  caseId: string;
  ticketReference: string;
}

export const createServiceCaseTool = defineTool<z.infer<typeof schema>, CreateServiceCaseData>({
  name: 'create_service_case',
  description:
    'Log a service Case in Zoho CRM for an existing owner: a complaint/repair, warranty issue, accident repair, or periodic maintenance booking. Requires the owner to already exist as a Contact (found by phone) — if not found, this returns CONTACT_NOT_FOUND with a hint to use create_contact after confirming details with the customer. Always read back a summary and get explicit confirmation before calling this.',
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
    const odoResult = validateOdometer(args.odometer_km);
    if (!odoResult.valid) {
      return toolErr(
        'INVALID_ODOMETER',
        odoResult.reason,
        'Ask the customer for the correct odometer reading.',
      );
    }

    const contact = await findContactByPhone(ctx.zohoClient, phoneResult.value);
    if (!contact) {
      return toolErr(
        'CONTACT_NOT_FOUND',
        'No existing owner record found for this phone number.',
        'Tell the customer we could not find them under this number, confirm their full name and email, and offer to register them with create_contact before logging the service case.',
      );
    }

    try {
      const created = await createServiceCase(ctx.zohoClient, {
        contactId: contact.id,
        registrationNumber: regResult.value,
        odometerKm: odoResult.value,
        serviceType: args.service_type,
        issueDescription: args.issue_description,
        preferredServiceCenter: args.preferred_service_center,
        vehicleModel: args.vehicle_model,
      });
      return toolOk({ caseId: created.id, ticketReference: `SVC-${created.id.slice(-6)}` });
    } catch (err) {
      if (err instanceof ZohoError) {
        ctx.logger.error(
          { code: err.code, message: err.message },
          'create_service_case failed in Zoho',
        );
        return toolErr(
          err.code,
          `Zoho rejected the service case: ${err.message}`,
          'Apologize that the service request could not be logged right now and offer to try again shortly, or take details down for manual follow-up.',
        );
      }
      throw err;
    }
  },
});
