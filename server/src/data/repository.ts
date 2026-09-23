import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const engineOptionSchema = z.object({
  fuel: z.string(),
  displacement: z.string(),
  power_bhp: z.number(),
  torque_nm: z.number(),
  power_variant_bhp: z.number().optional(),
});

const variantSchema = z.object({
  name: z.string(),
  fuel_options: z.array(z.string()),
  transmission_options: z.array(z.string()),
  drivetrain_options: z.array(z.string()).optional(),
  seating: z.array(z.number()),
  key_features: z.array(z.string()),
  price_range_inr: z.object({ min: z.number(), max: z.number() }),
});

const vehicleModelSchema = z.object({
  model: z.string(),
  category: z.string(),
  tagline: z.string(),
  seating_options: z.array(z.number()),
  engine_options: z.array(engineOptionSchema),
  transmission_options: z.array(z.string()),
  drivetrain_options: z.array(z.string()),
  variants: z.array(variantSchema),
});

const vehicleCatalogSchema = z.object({
  last_updated: z.string(),
  disclaimer: z.string(),
  vehicles: z.array(vehicleModelSchema),
});

const serviceScheduleEntrySchema = z.object({
  model: z.string(),
  first_free_service: z.object({ km: z.number(), months: z.number() }),
  periodic_interval: z.object({ km: z.number(), months: z.number() }),
  notes: z.string(),
});

const serviceScheduleFileSchema = z.object({
  last_updated: z.string(),
  disclaimer: z.string(),
  schedules: z.array(serviceScheduleEntrySchema),
});

export type VehicleModel = z.infer<typeof vehicleModelSchema>;
export type VehicleVariant = z.infer<typeof variantSchema>;
export type VehicleCatalog = z.infer<typeof vehicleCatalogSchema>;
export type ServiceScheduleEntry = z.infer<typeof serviceScheduleEntrySchema>;
export type ServiceScheduleFile = z.infer<typeof serviceScheduleFileSchema>;

function loadJson<T>(filename: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(path.resolve(__dirname, filename), 'utf-8');
  return schema.parse(JSON.parse(raw));
}

let vehicleCatalogCache: VehicleCatalog | null = null;
let serviceScheduleCache: ServiceScheduleFile | null = null;

export function getVehicleCatalog(): VehicleCatalog {
  if (!vehicleCatalogCache) {
    vehicleCatalogCache = loadJson('vehicles.json', vehicleCatalogSchema);
  }
  return vehicleCatalogCache;
}

export function getServiceScheduleFile(): ServiceScheduleFile {
  if (!serviceScheduleCache) {
    serviceScheduleCache = loadJson('serviceSchedule.json', serviceScheduleFileSchema);
  }
  return serviceScheduleCache;
}

export function findVehicleModel(modelName: string): VehicleModel | undefined {
  const normalized = modelName.trim().toLowerCase();
  return getVehicleCatalog().vehicles.find((v) => v.model.toLowerCase() === normalized);
}

export function findServiceScheduleForModel(modelName: string): ServiceScheduleEntry | undefined {
  const normalized = modelName.trim().toLowerCase();
  return getServiceScheduleFile().schedules.find((s) => s.model.toLowerCase() === normalized);
}
