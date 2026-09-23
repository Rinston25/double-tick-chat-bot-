import { z } from 'zod';
import { FOLLOW_UP_PREFERENCES } from '../../config/zohoFields.js';
import { findDealById, updateDealFollowup } from '../../zoho/deals.js';
import { ZohoError, toolErr, toolOk } from '../../utils/errors.js';
import { defineTool } from './types.js';

const schema = z.object({
  deal_id: z.string().min(1).describe('Zoho Deal record ID to update'),
  follow_up_preference: z
    .enum(FOLLOW_UP_PREFERENCES)
    .describe('How the customer prefers to be contacted'),
  follow_up_time: z
    .string()
    .optional()
    .describe('Free-text preferred time window, e.g. "weekday evenings after 6pm"'),
  notes: z.string().optional().describe('Any additional note to record on the deal'),
});

export interface UpdateDealFollowupData {
  dealId: string;
  followUpPreference: string;
  followUpTime: string | null;
}

export const updateDealFollowupTool = defineTool<z.infer<typeof schema>, UpdateDealFollowupData>({
  name: 'update_deal_followup',
  description:
    'Update the follow-up contact preference (and optionally time window / notes) on an existing open Deal. Use after get_deal_status when the customer wants to change how or when the dealer follows up with them. Confirm the change with the customer before calling this.',
  schema,
  async execute(args, ctx) {
    const existing = await findDealById(ctx.zohoClient, args.deal_id);
    if (!existing) {
      return toolErr(
        'DEAL_NOT_FOUND',
        `No Deal found with ID ${args.deal_id}.`,
        'Ask the customer to re-confirm their phone number so the deal can be looked up again via get_deal_status.',
      );
    }

    try {
      const updated = await updateDealFollowup(ctx.zohoClient, {
        dealId: args.deal_id,
        followUpPreference: args.follow_up_preference,
        followUpTime: args.follow_up_time,
        notes: args.notes,
      });
      return toolOk({
        dealId: updated.id,
        followUpPreference: updated.followUpPreference ?? args.follow_up_preference,
        followUpTime: updated.followUpTime,
      });
    } catch (err) {
      if (err instanceof ZohoError) {
        ctx.logger.error(
          { code: err.code, message: err.message },
          'update_deal_followup failed in Zoho',
        );
        return toolErr(
          err.code,
          `Zoho rejected the update: ${err.message}`,
          'Apologize that the preference could not be saved right now and offer to try again shortly.',
        );
      }
      throw err;
    }
  },
});
