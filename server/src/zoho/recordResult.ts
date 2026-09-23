import { ZohoError } from '../utils/errors.js';
import type { ZohoRecordResult } from './client.js';

/**
 * Zoho's create/update APIs return HTTP 200/201 even when the individual
 * record failed (e.g. a missing required field) — the real result is
 * per-record inside `data[0]`. This unwraps that and throws a ZohoError
 * for a failed record so callers can treat "success" uniformly.
 */
export function firstRecordOrThrow(response: { data?: ZohoRecordResult[] }): ZohoRecordResult {
  const first = response.data?.[0];
  if (!first) {
    throw new ZohoError({
      code: 'EMPTY_RESPONSE',
      message: 'Zoho returned no record result',
      status: 200,
    });
  }
  if (first.status !== 'success') {
    const details = first.details as { api_name?: string } | undefined;
    const suffix = details?.api_name ? ` (field: ${details.api_name})` : '';
    throw new ZohoError({
      code: first.code,
      message: `${first.message}${suffix}`,
      status: 200,
      details: first.details,
    });
  }
  return first;
}

export function recordId(result: ZohoRecordResult): string {
  const details = result.details as { id?: string } | undefined;
  if (!details?.id) {
    throw new ZohoError({
      code: 'MISSING_ID',
      message: 'Zoho record result had no id',
      status: 200,
    });
  }
  return details.id;
}
