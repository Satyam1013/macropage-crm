import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  WORK_LOG_SCOPES,
  WORK_LOG_STATUSES,
  WorkLogScope,
  WorkLogStatus,
} from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';

/**
 * What one staff member is doing. Exactly one of projectId / leadId is set, matching `scope`.
 * Soft-deleted together with its staff member or lead.
 */
@Schema({ timestamps: true, collection: 'work_logs' })
export class WorkLog extends BaseEntity {
  @Prop({ type: String, enum: WORK_LOG_SCOPES, required: true })
  scope: WorkLogScope;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Lead', default: null })
  leadId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Staff', required: true })
  staffId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ type: String, default: '' })
  note: string;

  @Prop({ type: String, enum: WORK_LOG_STATUSES, default: 'IN_PROGRESS' })
  status: WorkLogStatus;
}

export type WorkLogDocument = HydratedDocument<WorkLog>;
export const WorkLogSchema = SchemaFactory.createForClass(WorkLog);
WorkLogSchema.pre('validate', function (next) {
  const ok =
    this.scope === 'PROJECT' ? !!this.projectId && !this.leadId : !!this.leadId && !this.projectId;
  next(
    ok
      ? undefined
      : new Error('A work log must set exactly one of projectId / leadId, matching scope'),
  );
});
WorkLogSchema.index({ projectId: 1, updatedAt: -1 });
WorkLogSchema.index({ leadId: 1, updatedAt: -1 });
WorkLogSchema.index({ staffId: 1, status: 1, updatedAt: -1 });
WorkLogSchema.index({ updatedAt: -1 });
applyCommonPlugins(WorkLogSchema);
