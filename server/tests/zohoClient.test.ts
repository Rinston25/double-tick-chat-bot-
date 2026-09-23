import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { ZohoClient } from '../src/zoho/client.js';
import { ZohoError } from '../src/utils/errors.js';
import type { ZohoTokenManager } from '../src/zoho/auth.js';

const silentLogger = pino({ level: 'silent' });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function fakeTokenManager(tokens: string[] = ['tok-a']): {
  manager: Pick<ZohoTokenManager, 'getAccessToken'>;
  calls: Array<{ forceRefresh?: boolean }>;
} {
  const calls: Array<{ forceRefresh?: boolean }> = [];
  let idx = 0;
  return {
    calls,
    manager: {
      getAccessToken: vi.fn(async (opts: { forceRefresh?: boolean } = {}) => {
        calls.push(opts);
        if (opts.forceRefresh && idx < tokens.length - 1) idx++;
        return tokens[idx] as string;
      }),
    },
  };
}

describe('ZohoClient', () => {
  it('sends the Zoho-oauthtoken auth header and parses a successful GET', async () => {
    const { manager } = fakeTokenManager(['tok-a']);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: '1' }] }));
    const client = new ZohoClient({
      apiDomain: 'https://www.zohoapis.in',
      apiVersion: 'v7',
      tokenManager: manager as ZohoTokenManager,
      logger: silentLogger,
      fetchImpl,
    });

    const result = await client.get<{ data: Array<{ id: string }> }>('/Leads/1');
    expect(result.data[0]?.id).toBe('1');
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Zoho-oauthtoken tok-a');
  });

  it('treats HTTP 204 on search as an empty array, not an error', async () => {
    const { manager } = fakeTokenManager();
    const fetchImpl = vi.fn().mockResolvedValue(emptyResponse(204));
    const client = new ZohoClient({
      apiDomain: 'https://www.zohoapis.in',
      apiVersion: 'v7',
      tokenManager: manager as ZohoTokenManager,
      logger: silentLogger,
      fetchImpl,
    });

    const results = await client.search('Leads', { phone: '9876543210' });
    expect(results).toEqual([]);
  });

  it('force-refreshes and retries exactly once on a 401', async () => {
    const { manager, calls } = fakeTokenManager(['expired-tok', 'fresh-tok']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 'INVALID_TOKEN', message: 'invalid oauth token' }, 401),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: '42' }] }));

    const client = new ZohoClient({
      apiDomain: 'https://www.zohoapis.in',
      apiVersion: 'v7',
      tokenManager: manager as ZohoTokenManager,
      logger: silentLogger,
      fetchImpl,
    });

    const result = await client.get<{ data: Array<{ id: string }> }>('/Leads/1');
    expect(result.data[0]?.id).toBe('42');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(calls[1]).toEqual({ forceRefresh: true });

    const [, secondInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect((secondInit.headers as Record<string, string>).Authorization).toBe(
      'Zoho-oauthtoken fresh-tok',
    );
  });

  it('does not loop forever if the token is still invalid after one retry', async () => {
    const { manager } = fakeTokenManager(['expired-tok', 'still-bad']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'INVALID_TOKEN', message: 'nope' }, 401));
    const client = new ZohoClient({
      apiDomain: 'https://www.zohoapis.in',
      apiVersion: 'v7',
      tokenManager: manager as ZohoTokenManager,
      logger: silentLogger,
      fetchImpl,
    });

    await expect(client.get('/Leads/1')).rejects.toThrow(ZohoError);
    // Exactly 2 attempts: the original + the single 401-triggered retry. No infinite loop.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries 429 with backoff honoring Retry-After, then succeeds', async () => {
    const { manager } = fakeTokenManager();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 'TOO_MANY_REQUESTS' }, 429, { 'retry-after': '0' }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: '7' }] }));
    const client = new ZohoClient({
      apiDomain: 'https://www.zohoapis.in',
      apiVersion: 'v7',
      tokenManager: manager as ZohoTokenManager,
      logger: silentLogger,
      fetchImpl,
    });

    const result = await client.get<{ data: Array<{ id: string }> }>('/Leads/1');
    expect(result.data[0]?.id).toBe('7');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries on repeated 5xx and throws a normalized ZohoError', async () => {
    const { manager } = fakeTokenManager();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'INTERNAL_ERROR', message: 'boom' }, 500));
    const client = new ZohoClient({
      apiDomain: 'https://www.zohoapis.in',
      apiVersion: 'v7',
      tokenManager: manager as ZohoTokenManager,
      logger: silentLogger,
      fetchImpl,
      maxRetries: 2,
    });

    await expect(client.get('/Leads/1')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  }, 10000);

  it('normalizes a validation error (e.g. INVALID_DATA) from a POST', async () => {
    const { manager } = fakeTokenManager();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { code: 'INVALID_DATA', message: 'invalid data', details: { api_name: 'Vehicle_Model' } },
          400,
        ),
      );
    const client = new ZohoClient({
      apiDomain: 'https://www.zohoapis.in',
      apiVersion: 'v7',
      tokenManager: manager as ZohoTokenManager,
      logger: silentLogger,
      fetchImpl,
    });

    await expect(client.post('/Leads', { data: [{}] })).rejects.toMatchObject({
      code: 'INVALID_DATA',
      status: 400,
    });
  });
});
