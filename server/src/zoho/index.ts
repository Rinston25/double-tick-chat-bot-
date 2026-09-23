import { env } from '../config/env.js';
import type { AppLogger } from '../utils/logger.js';
import { ZohoClient } from './client.js';
import { ZohoTokenManager } from './auth.js';

export function createZohoClient(logger: AppLogger): {
  client: ZohoClient;
  tokenManager: ZohoTokenManager;
} {
  const tokenManager = new ZohoTokenManager({
    accountsUrl: env.ZOHO_ACCOUNTS_URL,
    clientId: env.ZOHO_CLIENT_ID,
    clientSecret: env.ZOHO_CLIENT_SECRET,
    refreshToken: env.ZOHO_REFRESH_TOKEN,
    logger,
  });
  const client = new ZohoClient({
    apiDomain: env.ZOHO_API_DOMAIN,
    apiVersion: env.ZOHO_API_VERSION,
    tokenManager,
    logger,
  });
  return { client, tokenManager };
}

export type { ZohoClient } from './client.js';
export type { ZohoTokenManager } from './auth.js';
