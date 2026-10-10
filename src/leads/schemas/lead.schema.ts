import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { LEAD_STAGES, LeadStage } from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';
import {
  StageHistoryEntry,
  StageHistoryEntrySchema,
} from '../../common/schemas/stage-history.schema';

/** One price per plan, entered when the lead reaches PROPOSAL. */
@Schema({ _id: false })
export class LeadQuote {
  @Prop({ type: Number, required: true, min: 0 })
  PRO: number;

  @Prop({ type: Number, required: true, min: 0 })
  PREMIUM: number;
}
export const LeadQuoteSchema = SchemaFactory.createForClass(LeadQuote);

@Schema({ timestamps: true, collection: 'leads' })
export class Lead extends BaseEntity {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  company: string;

  @Prop({ trim: true, default: '' })
  contactName: string;

  @Prop({ trim: true, default: '' })
  phone: string;

  @Prop({ trim: true, lowercase: true, default: '' })
  email: string;

  @Prop({ trim: true, default: '' })
  source: string;

  @Prop({ type: Number, min: 0, default: 0 })
  value: number;

  @Prop({ type: String, enum: LEAD_STAGES, default: 'LEAD' })
  stage: LeadStage;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Staff', required: true })
  ownerId: Types.ObjectId;

  /** Null until a quotation is sent; required to enter PROPOSAL. */
  @Prop({ type: LeadQuoteSchema, default: null })
  quote?: LeadQuote | null;

  @Prop({ type: Date, default: null })
  expectedClose?: Date | null;

  @Prop({ type: String, default: '' })
  notes: string;

  @Prop({ type: Date, default: null })
  wonAt?: Date | null;

  /** Set on conversion, or earlier by an admin to share the lead in the customer's portal. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', default: null })
  customerId?: Types.ObjectId | null;

  /**
   * Set only on conversion. No default: the unique *sparse* index skips documents where the
   * field is absent, but would still index an explicit `null`.
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() })
  stageUpdatedAt: Date;

  /** Shown under "My Discussions" in the linked customer's portal (requires customerId). */
  @Prop({ default: false })
  visibleToClient: boolean;

  /** Include `value` in the customer's discussion view. */
  @Prop({ default: false })
  showValueToClient: boolean;

  @Prop({ type: [StageHistoryEntrySchema], default: [] })
  stageHistory: StageHistoryEntry<LeadStage>[];
}

export type LeadDocument = HydratedDocument<Lead>;
export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ stage: 1, createdAt: -1 });
LeadSchema.index({ ownerId: 1, createdAt: -1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ projectId: 1 }, { unique: true, sparse: true });
LeadSchema.index({ customerId: 1, visibleToClient: 1, stage: 1 });
LeadSchema.index(
  { title: 'text', company: 'text', contactName: 'text' },
  { name: 'lead_text_search', weights: { title: 3, company: 2, contactName: 1 } },
);
applyCommonPlugins(LeadSchema, { dateOnly: ['expectedClose'] });
