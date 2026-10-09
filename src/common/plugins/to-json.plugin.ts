import { Schema, Types } from 'mongoose';
import { toDateOnly } from '../utils/date.util';

export interface ToJsonPluginOptions {
  /** Paths serialised as `YYYY-MM-DD` instead of full ISO timestamps. */
  dateOnly?: string[];
}

const HIDDEN_FIELDS = ['_id', '__v', 'passwordHash', 'refreshTokenHash', 'deletedAt'];

function normalise(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (obj._id !== undefined && obj.id === undefined) out.id = normalise(obj._id);
    for (const [key, v] of Object.entries(obj)) {
      if (HIDDEN_FIELDS.includes(key)) continue;
      out[key] = normalise(v);
    }
    return out;
  }
  return value;
}

/**
 * Shared `toJSON` transform: exposes `id` instead of `_id`/`__v`, strips secrets and
 * `deletedAt`, converts ObjectIds to strings and formats date-only paths as `YYYY-MM-DD`.
 */
export function toJsonPlugin(schema: Schema, options: ToJsonPluginOptions = {}): void {
  const dateOnly = options.dateOnly ?? [];
  schema.set('toJSON', {
    virtuals: false,
    versionKey: false,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      const dateOnlyValues = Object.fromEntries(
        dateOnly.map((path) => [path, toDateOnly(ret[path] as Date | null | undefined)]),
      );
      const out = normalise(ret) as Record<string, unknown>;
      for (const path of dateOnly) {
        if (path in ret) out[path] = dateOnlyValues[path];
      }
      return out;
    },
  });
}
