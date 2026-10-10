import { applyDecorators } from '@nestjs/common';
import { Expose, Transform } from 'class-transformer';
import { IsNumber, Max, Min, registerDecorator, ValidationOptions } from 'class-validator';
import { isValidDateOnly } from '../utils/date.util';
import { normalizePhone } from '../utils/phone.util';
import { round2 } from '../utils/money.util';

/** `YYYY-MM-DD` (an ISO timestamp is also accepted; only its date part is kept). */
export function IsDateOnly(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isDateOnly',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must be a date in YYYY-MM-DD format`,
        ...options,
      },
      validator: { validate: (value: unknown) => isValidDateOnly(value) },
    });
  };
}

/** Non-negative money amount, max 2 decimals after rounding; strings are coerced. */
export function IsMoney(opts: { positive?: boolean } = {}): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => {
      if (value === null || value === undefined || value === '') return value;
      const n = typeof value === 'string' ? Number(value) : value;
      return typeof n === 'number' && Number.isFinite(n) ? round2(n) : value;
    }),
    IsNumber({ allowNaN: false, allowInfinity: false }),
    Min(opts.positive ? 0.01 : 0, {
      message: ({ property }) => `${property} must be ${opts.positive ? 'greater than 0' : '>= 0'}`,
    }),
    Max(1e12),
  );
}

/**
 * Lets a DTO property also be populated from an alias key (e.g. the frontend's `owner` for
 * `ownerId`, or `date` for `paidOn`). The canonical key wins when both are sent.
 */
export function Alias(alias: string, opts: { keepNull?: boolean } = {}): PropertyDecorator {
  return applyDecorators(
    // Without @Expose, class-transformer skips keys absent from the payload, so the
    // transform would never see a request that only carries the alias.
    Expose(),
    Transform(
      ({ value, obj }) => {
        // By default an explicit null counts as absent; `keepNull` lets null clear a field.
        const given = opts.keepNull ? value !== undefined : value !== undefined && value !== null;
        return given ? value : (obj as Record<string, unknown>)[alias];
      },
      { toClassOnly: true },
    ),
  );
}

/**
 * Phone number, normalised to digits with country code (see normalizePhone). '' becomes null so
 * that an optional field can be cleared; combine with @IsOptional() for that.
 */
export function IsPhone(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => {
      if (typeof value === 'string' && value.trim() === '') return null;
      return normalizePhone(value) ?? value;
    }),
    (target: object, propertyName: string | symbol) =>
      registerDecorator({
        name: 'isPhone',
        target: target.constructor,
        propertyName: propertyName as string,
        options: {
          message: `${String(propertyName)} must be a valid phone number (e.g. 9876543210 or +91 98765 43210)`,
        },
        validator: { validate: (value: unknown) => normalizePhone(value) === value },
      }),
  );
}

/** Trims strings; leaves other values untouched. */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
