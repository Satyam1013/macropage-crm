import type { Types } from 'mongoose';

/** Fields every schema has: from `{ timestamps: true }` and `softDeletePlugin`. */
export abstract class BaseEntity {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}
