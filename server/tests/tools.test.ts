import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { getToolSpecsForLLM, listToolNames, runTool } from '../src/agent/tools/index.js';
import type { ToolContext } from '../src/agent/tools/types.js';
import type { ZohoClient } from '../src/zoho/client.js';

const silentLogger = pino({ level: 'silent' });

function makeCtx(overrides: Partial<ZohoClient> = {}): ToolContext {
  const zohoClient = {
    search: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
    put: vi.fn(),
    ...overrides,
  } as unknown as ZohoClient;
  return { zohoClient, logger: silentLogger, sessionId: 'test-session' };
}

describe('tool registry', () => {
  it('lists all 9 required tools', () => {
    expect(listToolNames().sort()).toEqual(
      [
        'create_contact',
        'create_lead',
        'create_service_case',
        'find_customer',
        'get_booking_status',
        'get_deal_status',
        'get_service_schedule',
        'get_vehicle_info',
        'update_deal_followup',
      ].sort(),
    );
  });

  it('produces valid JSON-schema function specs for every tool', () => {
    const specs = getToolSpecsForLLM();
    expect(specs).toHaveLength(9);
    for (const spec of specs) {
      expect(spec.type).toBe('function');
      expect(spec.function.name).toBeTruthy();
      expect(spec.function.description.length).toBeGreaterThan(10);
      expect(spec.function.parameters).toBeTypeOf('object');
      expect(spec.function.parameters).not.toHaveProperty('$schema');
    }
  });

  it('returns UNKNOWN_TOOL for an unregistered tool name', async () => {
    const result = await runTool('delete_everything', {}, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('UNKNOWN_TOOL');
  });

  it('returns INVALID_ARGS when required fields are missing, without executing the tool', async () => {
    const result = await runTool('get_vehicle_info', {}, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe('INVALID_ARGS');
      expect(result.hint).toMatch(/re-check/i);
    }
  });

  it('rejects args of the wrong type', async () => {
    const result = await runTool('get_vehicle_info', { model: 123 }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('INVALID_ARGS');
  });
});

describe('get_vehicle_info tool', () => {
  it('returns catalog data for a known model', async () => {
    const result = await runTool('get_vehicle_info', { model: 'Thar' }, makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { model: string; variants: unknown[] };
      expect(data.model).toBe('Thar');
      expect(data.variants.length).toBeGreaterThan(0);
    }
  });

  it('filters to a specific variant', async () => {
    const result = await runTool(
      'get_vehicle_info',
      { model: 'XUV700', variant: 'AX7 L' },
      makeCtx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { variants: Array<{ name: string }> };
      expect(data.variants).toHaveLength(1);
      expect(data.variants[0]?.name).toBe('AX7 L');
    }
  });

  it('returns a helpful error for an unknown model, never invents data', async () => {
    const result = await runTool('get_vehicle_info', { model: 'Bolero' }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe('MODEL_NOT_FOUND');
      expect(result.hint).toMatch(/XUV700/);
    }
  });

  it('returns a helpful error for an unknown variant', async () => {
    const result = await runTool('get_vehicle_info', { model: 'Thar', variant: 'GTX' }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('VARIANT_NOT_FOUND');
  });
});

describe('get_service_schedule tool', () => {
  it('returns indicative schedule data for a known model', async () => {
    const result = await runTool('get_service_schedule', { model: 'Scorpio-N' }, makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { periodic_interval: { km: number } };
      expect(data.periodic_interval.km).toBeGreaterThan(0);
    }
  });

  it('errors for an unknown model', async () => {
    const result = await runTool('get_service_schedule', { model: 'Bolero' }, makeCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('MODEL_NOT_FOUND');
  });
});

describe('find_customer tool', () => {
  it('rejects an invalid phone before hitting Zoho', async () => {
    const ctx = makeCtx();
    const result = await runTool('find_customer', { phone: '12345' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('INVALID_PHONE');
    expect(ctx.zohoClient.search).not.toHaveBeenCalled();
  });

  it('returns empty findings when nothing matches', async () => {
    const ctx = makeCtx();
    const result = await runTool('find_customer', { phone: '9876543210' }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { contact: unknown; lead: unknown };
      expect(data.contact).toBeNull();
      expect(data.lead).toBeNull();
    }
  });
});

describe('create_service_case tool', () => {
  it('returns CONTACT_NOT_FOUND with a hint to register when no contact exists', async () => {
    const ctx = makeCtx();
    const result = await runTool(
      'create_service_case',
      {
        phone: '9001122334',
        registration_number: 'MH02AB1234',
        odometer_km: 12000,
        service_type: 'Periodic Maintenance',
        issue_description: 'Routine 12,000 km service',
        preferred_service_center: 'Mahindra Workshop, Kothrud',
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_code).toBe('CONTACT_NOT_FOUND');
      expect(result.hint).toMatch(/create_contact/);
    }
  });

  it('validates the registration number before calling Zoho', async () => {
    const ctx = makeCtx();
    const result = await runTool(
      'create_service_case',
      {
        phone: '9001122334',
        registration_number: 'NOT-A-PLATE',
        odometer_km: 12000,
        service_type: 'Periodic Maintenance',
        issue_description: 'Routine service',
        preferred_service_center: 'Mahindra Workshop, Kothrud',
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error_code).toBe('INVALID_REGISTRATION_NUMBER');
    expect(ctx.zohoClient.search).not.toHaveBeenCalled();
  });
});
