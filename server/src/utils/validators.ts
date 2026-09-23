/**
 * Pure, dependency-free validation + normalization helpers shared by the
 * tool layer. Every function here is deterministic and side-effect free so
 * it can be unit tested directly (see tests/validators.test.ts).
 */

export type ValidationResult<T> = { valid: true; value: T } | { valid: false; reason: string };

/**
 * Normalizes an Indian mobile number to its bare 10-digit form.
 * Strips spaces, dashes, parentheses, a leading `+91`/`91`, and a leading `0`.
 */
export function normalizeIndianPhone(raw: string): string {
  let digits = raw.replace(/[\s\-().]/g, '');
  digits = digits.replace(/^\+/, '');
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  return digits;
}

/** Validates a 10-digit Indian mobile number (after normalization), must start 6-9. */
export function validateIndianPhone(raw: string): ValidationResult<string> {
  const normalized = normalizeIndianPhone(raw);
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return {
      valid: false,
      reason: 'That does not look like a valid 10-digit Indian mobile number.',
    };
  }
  return { valid: true, value: normalized };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();
  if (!EMAIL_RE.test(trimmed)) {
    return { valid: false, reason: 'That does not look like a valid email address.' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Normalizes an Indian vehicle registration number to uppercase, no spaces.
 * Accepts standard format (MH02AB1234 / MH 02 AB 1234) and the newer
 * BH-series format (22BH1234AA).
 */
export function normalizeRegistrationNumber(raw: string): string {
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

const STANDARD_REG_RE = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/;
const BH_SERIES_REG_RE = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

export function validateRegistrationNumber(raw: string): ValidationResult<string> {
  const normalized = normalizeRegistrationNumber(raw);
  if (!STANDARD_REG_RE.test(normalized) && !BH_SERIES_REG_RE.test(normalized)) {
    return {
      valid: false,
      reason:
        'That does not look like a valid Indian registration number (e.g. MH02AB1234 or 22BH1234AA).',
    };
  }
  return { valid: true, value: normalized };
}

export function validateOdometer(raw: number): ValidationResult<number> {
  if (!Number.isInteger(raw) || raw <= 0 || raw >= 1_000_000) {
    return {
      valid: false,
      reason: 'Odometer reading should be a positive whole number less than 1,000,000 km.',
    };
  }
  return { valid: true, value: raw };
}

/**
 * Normalizes a booking id such as "mah9921", "#MAH-9921", "MAH 9921" into
 * the canonical "MAH-9921" form.
 */
export function normalizeBookingId(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/^#/, '');
  const digits = cleaned.match(/\d{4,}/)?.[0];
  if (!digits) return cleaned.replace(/\s+/g, '');
  return `MAH-${digits}`;
}

const BOOKING_ID_RE = /^MAH-\d{4,}$/;

export function validateBookingId(raw: string): ValidationResult<string> {
  const normalized = normalizeBookingId(raw);
  if (!BOOKING_ID_RE.test(normalized)) {
    return {
      valid: false,
      reason: 'Booking IDs look like MAH-XXXX (e.g. MAH-9921). Please re-check the format.',
    };
  }
  return { valid: true, value: normalized };
}

/** Splits a full name into First_Name / Last_Name for Zoho's required Last_Name field. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: '', lastName: parts[0]! };
  }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1]! };
}

/** Formats a number of rupees using Indian digit grouping, e.g. 1399000 -> "13,99,000". */
export function formatIndianRupees(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)}`;
}

const IST_DATETIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Formats an ISO datetime string as e.g. "Fri, 25 Sep, 11:00 AM IST". Returns null for invalid input. */
export function formatIstDateTime(isoString: string): string | null {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return `${IST_DATETIME_FORMATTER.format(date)} IST`;
}

/** Formats an ISO date string as e.g. "Sat, 05 Oct 2026". Returns null for invalid input. */
export function formatIstDate(isoString: string): string | null {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return IST_DATE_FORMATTER.format(date);
}
