import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { INTERNAL_PROJECT_STATUSES, InternalProjectStatus } from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';

/**
 * A project for our own business: no client, lead, contract or payments. Its costs are
 * Expenses with `internalProjectId` set, so they count in Finance like any other expense.
 */
@Schema({ timestamps: true, collection: 'internal_projects' })
export class InternalProject extends BaseEntity {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: null })
  description?: string | null;

  @Prop({ type: String, enum: INTERNAL_PROJECT_STATUSES, default: 'ACTIVE' })
  status: InternalProjectStatus;

  @Prop({ type: Number, min: 0, default: null })
  budget?: number | null;

  @Prop({ type: Date, default: null })
  startDate?: Date | null;

  @Prop({ type: Date, default: null })
  endDate?: Date | null;
}

export type InternalProjectDocument = HydratedDocument<InternalProject>;
export const InternalProjectSchema = SchemaFactory.createForClass(InternalProject);
InternalProjectSchema.index({ status: 1, createdAt: -1 });
InternalProjectSchema.index({ createdAt: -1 });
applyCommonPlugins(InternalProjectSchema, { dateOnly: ['startDate', 'endDate'] });
