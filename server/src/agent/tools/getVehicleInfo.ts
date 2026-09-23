import { z } from 'zod';
import { findVehicleModel, getVehicleCatalog } from '../../data/repository.js';
import { toolErr, toolOk } from '../../utils/errors.js';
import { defineTool } from './types.js';

const schema = z.object({
  model: z.string().describe('Vehicle model name, e.g. "XUV700", "Thar", "Thar Roxx", "Scorpio-N"'),
  variant: z
    .string()
    .optional()
    .describe('Specific variant/trim, e.g. "AX7 L", "LX". Omit to list all variants.'),
});

export interface VehicleInfoData {
  model: string;
  category: string;
  tagline: string;
  disclaimer: string;
  variants: Array<{
    name: string;
    fuel_options: string[];
    transmission_options: string[];
    drivetrain_options?: string[];
    seating: number[];
    key_features: string[];
    price_range_inr: { min: number; max: number };
  }>;
}

export const getVehicleInfoTool = defineTool<z.infer<typeof schema>, VehicleInfoData>({
  name: 'get_vehicle_info',
  description:
    'Look up official catalog information for a Mahindra vehicle model: available variants, fuel/transmission options, key features, and indicative ex-showroom price range. Use this for any pricing or spec question. Never invent prices — this is the only source of truth for pricing.',
  schema,
  async execute(args) {
    const vehicle = findVehicleModel(args.model);
    if (!vehicle) {
      const available = getVehicleCatalog()
        .vehicles.map((v) => v.model)
        .join(', ');
      return toolErr(
        'MODEL_NOT_FOUND',
        `No catalog entry for "${args.model}".`,
        `Tell the customer we currently offer: ${available}. Ask which one they meant.`,
      );
    }

    let variants = vehicle.variants;
    if (args.variant) {
      const normalized = args.variant.trim().toLowerCase();
      const matched = vehicle.variants.filter((v) => v.name.toLowerCase() === normalized);
      if (matched.length === 0) {
        const availableVariants = vehicle.variants.map((v) => v.name).join(', ');
        return toolErr(
          'VARIANT_NOT_FOUND',
          `No variant "${args.variant}" found for ${vehicle.model}.`,
          `Tell the customer the available ${vehicle.model} variants are: ${availableVariants}.`,
        );
      }
      variants = matched;
    }

    return toolOk({
      model: vehicle.model,
      category: vehicle.category,
      tagline: vehicle.tagline,
      disclaimer: getVehicleCatalog().disclaimer,
      variants,
    });
  },
});
