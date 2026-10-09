const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a `YYYY-MM-DD` string (or an ISO timestamp, whose date part is used) into a Date at
 * UTC midnight. Throws on invalid input; DTO validation should run first.
 */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const match = DATE_ONLY_RE.exec(value.slice(0, 10));
  if (!match) throw new Error(`Invalid date: ${value}`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function isValidDateOnly(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_ONLY_RE.test(value.slice(0, 10))) return false;
  if (value.length > 10 && Number.isNaN(Date.parse(value))) return false;
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}

/** Serialises a Date as `YYYY-MM-DD` (UTC). */
export function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** UTC midnight of the first day of the month `offset` months from `ref`. */
export function startOfUtcMonth(ref: Date, offset = 0): Date {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + offset, 1));
}

/** `YYYY-MM` key for a date (UTC). */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}
