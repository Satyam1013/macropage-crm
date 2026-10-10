/** Used when a number is given without one (10-digit local or 0-prefixed trunk number). */
export const DEFAULT_COUNTRY_CODE = '91';

/** Stored phone format: digits only, country code first, no "+" (E.164 without the plus). */
export const NORMALIZED_PHONE = /^[1-9]\d{9,14}$/;

/**
 * Normalises a user-entered phone number, or returns null if it is not one.
 * "98765 43210", "098765-43210", "+91 98765 43210", "0091 9876543210" → "919876543210".
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
    else if (digits.length === 11 && digits.startsWith('0')) {
      digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
    }
  }
  return NORMALIZED_PHONE.test(digits) ? digits : null;
}
