/** Typed, normalized representation of any error returned by the Zoho CRM API. */
export class ZohoError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(params: { code: string; message: string; status: number; details?: unknown }) {
    super(params.message);
    this.name = 'ZohoError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }
}

/** Envelope every agent tool resolves with. Never throws to the caller. */
export type ToolResult<T> =
  { ok: true; data: T } | { ok: false; error_code: string; message: string; hint: string };

export function toolOk<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

export function toolErr(error_code: string, message: string, hint: string): ToolResult<never> {
  return { ok: false, error_code, message, hint };
}

/** Masks all but the last 4 characters of a sensitive string, for logs and SSE tool_start payloads. */
export function maskSensitive(value: string | undefined | null): string {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 4) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 4) + s.slice(-4);
}
