import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { runTool } from '../src/agent/tools/index.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import type { ZohoClient } from '../src/zoho/client.js';
import { ZOHO_MODULES } from '../src/config/zohoFields.js';

const silentLogger = pino({ level: 'silent' });

const validArgs = {
  full_name: 'Rajesh Sharma',
  phone: '9876543210',
  email: 'rajesh.sharma@example.com',
  preferred_city: 'Pune',
  vehicle_model: 'Thar' as const,
  test_drive_requested: true,
};

describe('create_lead tool', () => {
  it('does not create a duplicate when a Contact already exists for this phone', async () => {
    const search = vi.fn(async (module: string) => {
      if (module === ZOHO_MODULES.contacts) return [{ id: 'contact-1' }];
      return [];
    });
    const post = vi.fn();
    const zohoClient = { search, post, get: vi.fn(), put: vi.fn() } as unknown as ZohoClient;
    const ctx: ToolContext = { zohoClient, logger: silentLogger, sessionId: 's1' };

    const result = await runTool('create_lead', validArgs, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe('DUPLICATE');
      expect(result.hint).toMatch(/contact-1/);
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('does not create a duplicate when a Lead already exists for this phone', async () => {
    const search = vi.fn(async (module: string) => {
      if (module === ZOHO_MODULES.leads) return [{ id: 'lead-1' }];
      return [];
    });
    const post = vi.fn();
    const zohoClient = { search, post, get: vi.fn(), put: vi.fn() } as unknown as ZohoClient;
    const ctx: ToolContext = { zohoClient, logger: silentLogger, sessionId: 's1' };

    const result = await runTool('create_lead', validArgs, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('DUPLICATE');
    expect(post).not.toHaveBeenCalled();
  });

  it('creates a Lead when no existing record is found', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const post = vi.fn().mockResolvedValue({
      data: [
        {
          code: 'SUCCESS',
          status: 'success',
          message: 'record added',
          details: { id: 'new-lead-1' },
        },
      ],
    });
    const zohoClient = { search, post, get: vi.fn(), put: vi.fn() } as unknown as ZohoClient;
    const ctx: ToolContext = { zohoClient, logger: silentLogger, sessionId: 's1' };

    const result = await runTool('create_lead', validArgs, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { leadId: string };
      expect(data.leadId).toBe('new-lead-1');
    }
    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0] as [string, { data: Array<Record<string, unknown>> }];
    expect(path).toBe(`/${ZOHO_MODULES.leads}`);
    expect(body.data[0]?.Vehicle_Model).toBe('Thar');
  });

  it('surfaces a Zoho INVALID_DATA failure (e.g. missing custom field) as a user-safe hint', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const post = vi.fn().mockResolvedValue({
      data: [
        {
          code: 'INVALID_DATA',
          status: 'error',
          message: 'invalid data',
          details: { api_name: 'Vehicle_Model' },
        },
      ],
    });
    const zohoClient = { search, post, get: vi.fn(), put: vi.fn() } as unknown as ZohoClient;
    const ctx: ToolContext = { zohoClient, logger: silentLogger, sessionId: 's1' };

    const result = await runTool('create_lead', validArgs, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe('INVALID_DATA');
      expect(result.hint).not.toMatch(/Vehicle_Model/);
    }
  });

  it('rejects an invalid email before touching Zoho', async () => {
    const search = vi.fn();
    const zohoClient = {
      search,
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
    } as unknown as ZohoClient;
    const ctx: ToolContext = { zohoClient, logger: silentLogger, sessionId: 's1' };

    const result = await runTool('create_lead', { ...validArgs, email: 'not-an-email' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('INVALID_EMAIL');
    expect(search).not.toHaveBeenCalled();
  });
});
