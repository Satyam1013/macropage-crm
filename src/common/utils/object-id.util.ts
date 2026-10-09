import { isValidObjectId, Types } from 'mongoose';

type IdLike = Types.ObjectId | string | { _id?: unknown; id?: unknown } | null | undefined;

/** Normalises an ObjectId / string / populated doc into its string id (or null). */
export function idOf(value: IdLike): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'object' && '_id' in value && value._id !== undefined) {
    return idOf(value._id as IdLike);
  }
  return String(value);
}

export function toObjectId(value: string | Types.ObjectId): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

/** Strict check: 24 hex chars only (mongoose also accepts 12-byte strings). */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) && isValidObjectId(value);
}
