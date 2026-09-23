import { maskSensitive } from '../utils/errors.js';
import type { AppLogger } from '../utils/logger.js';

export interface ZohoTokenManagerConfig {
  accountsUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  logger: AppLogger;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for tests. */
  now?: () => number;
}

const PROACTIVE_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Owns the Zoho OAuth access token lifecycle: exchanges the long-lived
 * refresh token for a short-lived access token, caches it in memory,
 * refreshes proactively before expiry, and collapses concurrent refreshes
 * into a single in-flight request (Zoho rate-limits token refresh calls).
 */
export class ZohoTokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshPromise: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: ZohoTokenManagerConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  /**
   * Returns a valid access token, refreshing if the cached one is missing,
   * expired, or within 5 minutes of expiring. Pass `forceRefresh: true` to
   * discard the cached token unconditionally (used after a 401).
   */
  async getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
    const nowMs = this.now();
    const isFresh =
      this.accessToken !== null && nowMs < this.expiresAt - PROACTIVE_REFRESH_MARGIN_MS;

    if (!opts.forceRefresh && isFresh) {
      return this.accessToken as string;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refresh(): Promise<string> {
    const url = new URL('/oauth/v2/token', this.config.accountsUrl);
    url.searchParams.set('grant_type', 'refresh_token');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('client_secret', this.config.clientSecret);
    url.searchParams.set('refresh_token', this.config.refreshToken);

    const startedAt = this.now();
    const res = await this.fetchImpl(url.toString(), { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!res.ok || !body.access_token) {
      this.config.logger.error(
        { status: res.status, error: body.error },
        'Zoho OAuth token refresh failed',
      );
      throw new Error(`Zoho token refresh failed: ${body.error ?? res.statusText}`);
    }

    this.accessToken = body.access_token;
    const expiresInMs = (body.expires_in ?? 3600) * 1000;
    this.expiresAt = this.now() + expiresInMs;

    this.config.logger.info(
      {
        durationMs: this.now() - startedAt,
        expiresInSec: body.expires_in,
        token: maskSensitive(this.accessToken),
      },
      'Zoho OAuth token refreshed',
    );

    return this.accessToken;
  }
}
