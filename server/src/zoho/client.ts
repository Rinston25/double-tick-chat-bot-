import { ZohoError } from '../utils/errors.js';
import type { AppLogger } from '../utils/logger.js';
import type { ZohoTokenManager } from './auth.js';

export interface ZohoClientConfig {
  apiDomain: string;
  apiVersion: string;
  tokenManager: ZohoTokenManager;
  logger: AppLogger;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}

interface ZohoRecordResult {
  code: string;
  message: string;
  status: 'success' | 'error';
  details?: unknown;
}

interface ZohoListResponse<T> {
  data?: T[];
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin, typed HTTP wrapper around the Zoho CRM REST API. Handles auth
 * headers, timeouts, retries with backoff, 401 recovery, and normalizes
 * every failure into a `ZohoError`.
 */
export class ZohoClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ZohoClientConfig) {
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private baseUrl(path: string): string {
    return `${this.config.apiDomain}/crm/${this.config.apiVersion}${path}`;
  }

  private async rawRequest(
    method: string,
    url: string,
    body: unknown,
    accessToken: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Executes one logical Zoho API call with: 401 → force-refresh-and-retry
   * once, and 429/5xx → exponential backoff up to `maxRetries` retries.
   */
  private async execute(method: string, url: string, body?: unknown): Promise<Response> {
    let forceRefreshNext = false;
    let retried401 = false;

    for (let attempt = 0; ; attempt++) {
      const accessToken = await this.config.tokenManager.getAccessToken({
        forceRefresh: forceRefreshNext,
      });
      forceRefreshNext = false;

      const startedAt = Date.now();
      let res: Response;
      try {
        res = await this.rawRequest(method, url, body, accessToken);
      } catch (err) {
        if (attempt < this.maxRetries) {
          const delay = 300 * 2 ** attempt;
          this.config.logger.warn(
            { url, attempt, err: (err as Error).message },
            'Zoho request network error, retrying',
          );
          await sleep(delay);
          continue;
        }
        throw new ZohoError({
          code: 'NETWORK_ERROR',
          message: (err as Error).message,
          status: 0,
        });
      }

      this.config.logger.debug(
        { url, method, status: res.status, durationMs: Date.now() - startedAt },
        'Zoho HTTP request',
      );

      if (res.status === 401 && !retried401) {
        this.config.logger.info(
          'Zoho access token invalid (401), forcing refresh and retrying once',
        );
        retried401 = true;
        forceRefreshNext = true;
        continue;
      }

      if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
        const delay =
          retryAfterMs && !Number.isNaN(retryAfterMs) ? retryAfterMs : 300 * 2 ** attempt;
        this.config.logger.warn(
          { url, attempt, status: res.status },
          'Zoho request retryable failure, retrying',
        );
        await sleep(delay);
        continue;
      }

      return res;
    }
  }

  private async parseOrThrow<T>(res: Response): Promise<T> {
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : undefined;

    if (res.ok) {
      return parsed as T;
    }

    const errBody = parsed as { code?: string; message?: string; details?: unknown } | undefined;
    throw new ZohoError({
      code: errBody?.code ?? `HTTP_${res.status}`,
      message: errBody?.message ?? res.statusText,
      status: res.status,
      details: errBody?.details,
    });
  }

  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.baseUrl(path));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const res = await this.execute('GET', url.toString());
    return this.parseOrThrow<T>(res);
  }

  /**
   * GET against a Zoho `/search` endpoint. Zoho returns HTTP 204 (no body)
   * when there are no matches — this is normalized to an empty array
   * rather than treated as an error.
   */
  async search<T>(module: string, query: Record<string, string | number>): Promise<T[]> {
    const url = new URL(this.baseUrl(`/${module}/search`));
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
    const res = await this.execute('GET', url.toString());
    if (res.status === 204) {
      return [];
    }
    if (res.status === 404) {
      // Some Zoho DCs return 404 with a NO_DATA-shaped body instead of 204.
      return [];
    }
    const body = await this.parseOrThrow<ZohoListResponse<T>>(res);
    return body.data ?? [];
  }

  async post<T = ZohoRecordResult>(path: string, body: unknown): Promise<T> {
    const url = this.baseUrl(path);
    const res = await this.execute('POST', url, body);
    return this.parseOrThrow<T>(res);
  }

  async put<T = ZohoRecordResult>(path: string, body: unknown): Promise<T> {
    const url = this.baseUrl(path);
    const res = await this.execute('PUT', url, body);
    return this.parseOrThrow<T>(res);
  }
}

export type { ZohoRecordResult, ZohoListResponse };
