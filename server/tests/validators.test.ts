import { describe, expect, it } from 'vitest';
import {
  formatIndianRupees,
  normalizeBookingId,
  normalizeIndianPhone,
  normalizeRegistrationNumber,
  splitFullName,
  validateBookingId,
  validateEmail,
  validateIndianPhone,
  validateOdometer,
  validateRegistrationNumber,
} from '../src/utils/validators.js';

describe('normalizeIndianPhone', () => {
  it('strips spaces and dashes', () => {
    expect(normalizeIndianPhone('98765 43210')).toBe('9876543210');
    expect(normalizeIndianPhone('98765-43210')).toBe('9876543210');
  });

  it('strips a +91 country code', () => {
    expect(normalizeIndianPhone('+919876543210')).toBe('9876543210');
  });

  it('strips a leading 0 (STD-style)', () => {
    expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
  });

  it('handles combined formatting', () => {
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('9876543210');
  });
});

describe('validateIndianPhone', () => {
  it('accepts a valid 10-digit number starting with 6-9', () => {
    const result = validateIndianPhone('9876543210');
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBe('9876543210');
  });

  it('accepts with +91 prefix and normalizes', () => {
    const result = validateIndianPhone('+91 9876543210');
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value).toBe('9876543210');
  });

  it('rejects numbers starting with 0-5', () => {
    expect(validateIndianPhone('5876543210').valid).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(validateIndianPhone('987654321').valid).toBe(false);
    expect(validateIndianPhone('98765432101').valid).toBe(false);
  });
});

describe('validateEmail', () => {
  it('accepts a standard email', () => {
    expect(validateEmail('rajesh.sharma@example.com').valid).toBe(true);
  });

  it('rejects missing @', () => {
    expect(validateEmail('rajesh.sharma-example.com').valid).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(validateEmail('rajesh@').valid).toBe(false);
  });
});

describe('registration number', () => {
  it('normalizes standard format with spaces', () => {
    expect(normalizeRegistrationNumber('MH 02 AB 1234')).toBe('MH02AB1234');
  });

  it('validates standard format', () => {
    expect(validateRegistrationNumber('MH02AB1234').valid).toBe(true);
    expect(validateRegistrationNumber('MH 02 AB 1234').valid).toBe(true);
  });

  it('validates BH-series format', () => {
    expect(validateRegistrationNumber('22BH1234AA').valid).toBe(true);
  });

  it('rejects garbage', () => {
    expect(validateRegistrationNumber('NOT-A-PLATE').valid).toBe(false);
  });
});

describe('validateOdometer', () => {
  it('accepts a positive integer under 1,000,000', () => {
    expect(validateOdometer(45000).valid).toBe(true);
  });

  it('rejects zero and negative', () => {
    expect(validateOdometer(0).valid).toBe(false);
    expect(validateOdometer(-10).valid).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(validateOdometer(45000.5).valid).toBe(false);
  });

  it('rejects values >= 1,000,000', () => {
    expect(validateOdometer(1_000_000).valid).toBe(false);
  });
});

describe('booking id normalization + validation', () => {
  it('normalizes lowercase without dash', () => {
    expect(normalizeBookingId('mah9921')).toBe('MAH-9921');
  });

  it('normalizes with leading #', () => {
    expect(normalizeBookingId('#MAH-9921')).toBe('MAH-9921');
  });

  it('normalizes with a space instead of a dash', () => {
    expect(normalizeBookingId('MAH 9921')).toBe('MAH-9921');
  });

  it('validates the canonical form', () => {
    expect(validateBookingId('mah9921').valid).toBe(true);
  });

  it('rejects a booking id with no digits', () => {
    expect(validateBookingId('MAH-ABCD').valid).toBe(false);
  });
});

describe('splitFullName', () => {
  it('splits a two-part name', () => {
    expect(splitFullName('Rajesh Sharma')).toEqual({ firstName: 'Rajesh', lastName: 'Sharma' });
  });

  it('splits a multi-part name, keeping the last word as last name', () => {
    expect(splitFullName('Amit Kumar Verma')).toEqual({
      firstName: 'Amit Kumar',
      lastName: 'Verma',
    });
  });

  it('handles a single-word name', () => {
    expect(splitFullName('Cher')).toEqual({ firstName: '', lastName: 'Cher' });
  });
});

describe('formatIndianRupees', () => {
  it('formats using Indian digit grouping', () => {
    expect(formatIndianRupees(1_399_000)).toBe('₹13,99,000');
  });

  it('formats small values without extra grouping', () => {
    expect(formatIndianRupees(500)).toBe('₹500');
  });
});
