import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deliberately independent of src/config/env.ts: these CLI scripts only
// need the Zoho credentials, not the full app config (GROQ_API_KEY etc.),
// and get-refresh-token.ts must run *before* ZOHO_REFRESH_TOKEN exists.
const candidatePaths = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.cwd(), '.env'),
];
const envPath = candidatePaths.find((p) => existsSync(p));
dotenv.config(envPath ? { path: envPath } : undefined);

export interface ZohoAuthEnv {
  clientId: string;
  clientSecret: string;
  accountsUrl: string;
}

export interface ZohoFullEnv extends ZohoAuthEnv {
  refreshToken: string;
  apiDomain: string;
  apiVersion: string;
}

export function requireZohoAuthEnv(): ZohoAuthEnv {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';

  const missing: string[] = [];
  if (!clientId) missing.push('ZOHO_CLIENT_ID');
  if (!clientSecret) missing.push('ZOHO_CLIENT_SECRET');
  if (missing.length > 0) {
    console.error(
      `\nMissing required env var(s): ${missing.join(', ')}.\n` +
        'Copy .env.example to .env in the repo root and fill in your Zoho Self Client credentials ' +
        '(see docs/ZOHO_SETUP.md) before running this script.\n',
    );
    process.exit(1);
  }
  return { clientId: clientId as string, clientSecret: clientSecret as string, accountsUrl };
}

export function requireFullZohoEnv(): ZohoFullEnv {
  const base = requireZohoAuthEnv();
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!refreshToken) {
    console.error(
      '\nMissing ZOHO_REFRESH_TOKEN.\n' +
        'Run `npm run zoho:token -- <grant_code>` first, then paste the printed refresh token into .env.\n',
    );
    process.exit(1);
  }
  return {
    ...base,
    refreshToken,
    apiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in',
    apiVersion: process.env.ZOHO_API_VERSION || 'v7',
  };
}
