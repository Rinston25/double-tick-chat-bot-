import { z } from 'zod';
import { findServiceScheduleForModel, getServiceScheduleFile } from '../../data/repository.js';
import { toolErr, toolOk } from '../../utils/errors.js';
import { defineTool } from './types.js';

const schema = z.object({
  model: z.string().describe('Vehicle model name, e.g. "XUV700", "Thar", "Scorpio-N"'),
});

export interface ServiceScheduleData {
  model: string;
  disclaimer: string;
  first_free_service: { km: number; months: number };
  periodic_interval: { km: number; months: number };
  notes: string;
}

export const getServiceScheduleTool = defineTool<z.infer<typeof schema>, ServiceScheduleData>({
  name: 'get_service_schedule',
  description:
    'Look up the indicative periodic maintenance service (PMS) schedule for a vehicle model: first free service and recurring km/month intervals. Use when a customer asks about service intervals.',
  schema,
  async execute(args) {
    const entry = findServiceScheduleForModel(args.model);
    if (!entry) {
      const available = getServiceScheduleFile()
        .schedules.map((s) => s.model)
        .join(', ');
      return toolErr(
        'MODEL_NOT_FOUND',
        `No service schedule for "${args.model}".`,
        `Tell the customer we have schedule data for: ${available}. Ask which model they own.`,
      );
    }
    return toolOk({
      model: entry.model,
      disclaimer: getServiceScheduleFile().disclaimer,
      first_free_service: entry.first_free_service,
      periodic_interval: entry.periodic_interval,
      notes: entry.notes,
    });
  },
});
