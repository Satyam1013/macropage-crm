import type {
  Aggregate,
  ClientSession,
  HydratedDocument,
  Model,
  PipelineStage,
  Query,
  Schema,
  Types,
} from 'mongoose';

/**
 * Pass `{ withDeleted: true }` as a query option (`.setOptions(...)`, the options argument of
 * find/findOne/etc., or `aggregate().option(...)`) to include soft-deleted documents.
 */
export interface SoftDeleteQueryOptions {
  withDeleted?: boolean;
}

export interface SoftDeleteFields {
  deletedAt?: Date | null;
}

export interface SoftDeleteStatics<TRaw> {
  /** Sets `deletedAt = now` on a live document. Resolves to the updated document or null. */
  softDelete(
    id: Types.ObjectId | string,
    session?: ClientSession | null,
  ): Promise<HydratedDocument<TRaw> | null>;
  /** Clears `deletedAt` on a soft-deleted document. Resolves to the restored document or null. */
  restore(
    id: Types.ObjectId | string,
    session?: ClientSession | null,
  ): Promise<HydratedDocument<TRaw> | null>;
}

/** Model type to inject for any schema using {@link softDeletePlugin}. */
export type SoftDeleteModel<TRaw> = Model<TRaw> & SoftDeleteStatics<TRaw>;

const QUERY_HOOKS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'countDocuments',
  'updateOne',
  'updateMany',
] as const;

/** Stages that MongoDB requires to be the first stage of a pipeline. */
const MUST_BE_FIRST_STAGES = [
  '$geoNear',
  '$search',
  '$searchMeta',
  '$vectorSearch',
  '$collStats',
  '$indexStats',
  '$documents',
  '$changeStream',
];

function excludesDeleted(options: Record<string, unknown> | undefined): boolean {
  return !options?.withDeleted;
}

/**
 * Reusable soft-delete plugin.
 *
 * (a) adds `deletedAt: Date | null` (indexed, default null)
 * (b) query middleware filters `deletedAt: null` unless `{ withDeleted: true }` is set, or the
 *     filter already references `deletedAt` explicitly
 * (c) the same `$match` is injected at the start of every aggregate pipeline
 * (d) adds `softDelete(id)` / `restore(id)` statics
 */
export function softDeletePlugin(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null, index: true } });

  for (const hook of QUERY_HOOKS) {
    schema.pre(hook, function (this: Query<unknown, unknown>) {
      if (!excludesDeleted(this.getOptions() as Record<string, unknown>)) return;
      const filter = this.getFilter();
      if (Object.prototype.hasOwnProperty.call(filter, 'deletedAt')) return;
      this.where({ deletedAt: null });
    });
  }

  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    if (!excludesDeleted(this.options as Record<string, unknown>)) return;
    const pipeline = this.pipeline();
    const match: PipelineStage.Match = { $match: { deletedAt: null } };
    const first = pipeline[0] as unknown as Record<string, unknown> | undefined;
    if (first && MUST_BE_FIRST_STAGES.some((s) => s in first)) {
      pipeline.splice(1, 0, match);
    } else {
      pipeline.unshift(match);
    }
  });

  schema.static(
    'softDelete',
    function (this: Model<unknown>, id: Types.ObjectId | string, session?: ClientSession | null) {
      return this.findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: { deletedAt: new Date() } },
        { new: true, session: session ?? undefined },
      ).exec();
    },
  );

  schema.static(
    'restore',
    function (this: Model<unknown>, id: Types.ObjectId | string, session?: ClientSession | null) {
      return this.findOneAndUpdate(
        { _id: id, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { new: true, session: session ?? undefined },
      ).exec();
    },
  );
}
