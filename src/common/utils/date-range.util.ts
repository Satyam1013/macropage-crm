import { BadRequestException } from '@nestjs/common';
import { parseDateOnly } from './date.util';

/** Inclusive `{ $gte, $lte }` filter from optional YYYY-MM-DD bounds, or undefined. */
export function dateRange(from?: string, to?: string): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const range: Record<string, Date> = {};
  if (from) range.$gte = parseDateOnly(from);
  if (to) range.$lte = parseDateOnly(to);
  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    throw new BadRequestException('from must be on or before to');
  }
  return range;
}
