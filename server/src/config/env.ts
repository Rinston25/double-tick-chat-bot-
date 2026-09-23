import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The server is normally started with `server/` as the working directory,
// but the single .env file lives at the repo root so both `server` and
// `web` can share it. Try the repo root first, then fall back to a local
// server/.env for anyone who prefers per-package env files.
const candidatePaths = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
];
const envPath = candidatePaths.find((p) => existsSync(p));
dotenv.config(envPath ? { path: envPath } : undefined);

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  GROQ_API_KEY: z
    .string()
    .min(1, 'GROQ_API_KEY is required — get one from https://console.groq.com/keys'),
  GROQ_MODEL_AGENT: z.string().min(1).default('openai/gpt-oss-120b'),
  GROQ_MODEL_CLASSIFIER: z.string().min(1).default('openai/gpt-oss-20b'),

  REDIS_URL: z.string().url().optional().or(z.literal('')),

  ZOHO_CLIENT_ID: z.string().min(1, 'ZOHO_CLIENT_ID is required — see docs/ZOHO_SETUP.md'),
  ZOHO_CLIENT_SECRET: z.string().min(1, 'ZOHO_CLIENT_SECRET is required — see docs/ZOHO_SETUP.md'),
  ZOHO_REFRESH_TOKEN: z
    .string()
    .min(1, 'ZOHO_REFRESH_TOKEN is required — run `npm run zoho:token -- <grant_code>`'),
  ZOHO_ACCOUNTS_URL: z.string().url().default('https://accounts.zoho.in'),
  ZOHO_API_DOMAIN: z.string().url().default('https://www.zohoapis.in'),
  ZOHO_API_VERSION: z.string().min(1).default('v7'),
});

export type Env = z.infer<typeof envSchema> & { REDIS_URL?: string };

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(
      `\nInvalid or missing environment variables:\n${issues}\n\nCopy .env.example to .env in the repo root and fill in the values.\n`,
    );
    process.exit(1);
  }
  const value = parsed.data;
  return { ...value, REDIS_URL: value.REDIS_URL || undefined };
}

export const env = loadEnv();
