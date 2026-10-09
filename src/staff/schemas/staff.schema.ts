import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { STAFF_TYPES, StaffType } from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';

@Schema({ timestamps: true, collection: 'staff' })
export class Staff extends BaseEntity {
  @Prop({ required: true, trim: true })
  name: string;

  /** Job title, e.g. "Backend Engineer". */
  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ type: String, enum: STAFF_TYPES, required: true })
  type: StaffType;

  @Prop({ type: String, trim: true, lowercase: true, default: null })
  email?: string | null;

  @Prop({ type: String, trim: true, default: null })
  phone?: string | null;

  @Prop({ default: true })
  isActive: boolean;
}

export type StaffDocument = HydratedDocument<Staff>;
export const StaffSchema = SchemaFactory.createForClass(Staff);
StaffSchema.index({ type: 1, isActive: 1 });
applyCommonPlugins(StaffSchema);
