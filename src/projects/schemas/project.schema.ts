import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  PROJECT_PLANS,
  PROJECT_STAGES,
  ProjectPlan,
  ProjectStage,
} from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';
import {
  StageHistoryEntry,
  StageHistoryEntrySchema,
} from '../../common/schemas/stage-history.schema';

/** The four independent IN_PROGRESS tracks, each 0–100. */
@Schema({ _id: false })
export class DevProgress {
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  requirement: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  ui: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  frontend: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  backend: number;
}
export const DevProgressSchema = SchemaFactory.createForClass(DevProgress);

@Schema({ timestamps: true, collection: 'projects' })
export class Project extends BaseEntity {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Lead', required: true, unique: true })
  leadId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, default: '' })
  description: string;

  @Prop({ type: String, default: '' })
  requirements: string;

  @Prop({ type: String, enum: PROJECT_STAGES, default: 'INITIATE' })
  stage: ProjectStage;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ type: Number, required: true, min: 0 })
  contractValue: number;

  /** Plan chosen on Deal Won; null for projects converted before plans existed. */
  @Prop({ type: String, enum: [...PROJECT_PLANS, null], default: null })
  plan?: ProjectPlan | null;

  @Prop({ type: DevProgressSchema, default: () => ({}) })
  dev: DevProgress;

  @Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Staff' }], default: [] })
  team: Types.ObjectId[];

  @Prop({ default: false })
  clientApproved: boolean;

  @Prop({ type: String, default: null })
  clientNote?: string | null;

  @Prop({ type: Date, default: null })
  closedAt?: Date | null;

  @Prop({ type: [StageHistoryEntrySchema], default: [] })
  stageHistory: StageHistoryEntry<ProjectStage>[];
}

export type ProjectDocument = HydratedDocument<Project>;
export const ProjectSchema = SchemaFactory.createForClass(Project);
ProjectSchema.index({ stage: 1 });
ProjectSchema.index({ customerId: 1, stage: 1 });
ProjectSchema.index({ name: 'text' }, { name: 'project_text_search' });
applyCommonPlugins(ProjectSchema, { dateOnly: ['startDate', 'endDate'] });
