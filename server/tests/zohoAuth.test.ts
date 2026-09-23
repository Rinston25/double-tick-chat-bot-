import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZohoTokenManager } from '../src/zoho/auth.js';

const silentLogger = pino({ level: 'silent' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ZohoTokenManager', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = 1_700_000_000_000;
  });

  it('fetches and caches an access token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }));
    const manager = new ZohoTokenManager({
      accountsUrl: 'https://accounts.zoho.in',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
      logger: silentLogger,
      fetchImpl,
      now: clock,
    });

    const token = await manager.getAccessToken();
    expect(token).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Second call within the freshness window should NOT refetch.
    const token2 = await manager.getAccessToken();
    expect(token2).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends grant_type=refresh_token with the configured credentials', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }));
    const manager = new ZohoTokenManager({
      accountsUrl: 'https://accounts.zoho.in',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
      logger: silentLogger,
      fetchImpl,
      now: clock,
    });
    await manager.getAccessToken();

    const calledUrl = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://accounts.zoho.in/oauth/v2/token');
    expect(calledUrl.searchParams.get('grant_type')).toBe('refresh_token');
    expect(calledUrl.searchParams.get('client_id')).toBe('cid');
    expect(calledUrl.searchParams.get('client_secret')).toBe('csecret');
    expect(calledUrl.searchParams.get('refresh_token')).toBe('rtoken');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('proactively refreshes when within 5 minutes of expiry', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-2', expires_in: 3600 }));
    const manager = new ZohoTokenManager({
      accountsUrl: 'https://accounts.zoho.in',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
      logger: silentLogger,
      fetchImpl,
      now: clock,
    });

    const first = await manager.getAccessToken();
    expect(first).toBe('tok-1');

    // Advance to 56 minutes later — within the 5-minute proactive window of a 60-minute token.
    now += 56 * 60 * 1000;
    const second = await manager.getAccessToken();
    expect(second).toBe('tok-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not refresh before the proactive window', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }));
    const manager = new ZohoTokenManager({
      accountsUrl: 'https://accounts.zoho.in',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
      logger: silentLogger,
      fetchImpl,
      now: clock,
    });
    await manager.getAccessToken();

    now += 30 * 60 * 1000; // 30 minutes later, still fresh
    const token = await manager.getAccessToken();
    expect(token).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent refreshes into a single in-flight request (single-flight)', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchImpl = vi.fn().mockReturnValue(pending);
    const manager = new ZohoTokenManager({
      accountsUrl: 'https://accounts.zoho.in',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
      logger: silentLogger,
      fetchImpl,
      now: clock,
    });

    const call1 = manager.getAccessToken();
    const call2 = manager.getAccessToken();
    const call3 = manager.getAccessToken();

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse({ access_token: 'tok-shared', expires_in: 3600 }));

    const [r1, r2, r3] = await Promise.all([call1, call2, call3]);
    expect(r1).toBe('tok-shared');
    expect(r2).toBe('tok-shared');
    expect(r3).toBe('tok-shared');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh discards a cached token and refetches', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-1', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok-2', expires_in: 3600 }));
    const manager = new ZohoTokenManager({
      accountsUrl: 'https://accounts.zoho.in',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
      logger: silentLogger,
      fetchImpl,
      now: clock,
    });

    await manager.getAccessToken();
    const forced = await manager.getAccessToken({ forceRefresh: true });
    expect(forced).toBe('tok-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws a descriptive error when the refresh call fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_client' }, 400));
    const manager = new ZohoTokenManager({
      accountsUrl: 'https://accounts.zoho.in',
      clientId: 'cid',
      clientSecret: 'bad-secret',
      refreshToken: 'rtoken',
      logger: silentLogger,
      fetchImpl,
      now: clock,
    });

    await expect(manager.getAccessToken()).rejects.toThrow(/invalid_client/);
  });
});
