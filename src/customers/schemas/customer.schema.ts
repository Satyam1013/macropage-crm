import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';

@Schema({ timestamps: true, collection: 'customers' })
export class Customer extends BaseEntity {
  /** Company name. */
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  contactName: string;

  @Prop({ trim: true, lowercase: true, default: '' })
  email: string;

  @Prop({ trim: true, default: '' })
  phone: string;

  @Prop({ type: String, trim: true, default: null })
  address?: string | null;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ name: 1 });
applyCommonPlugins(CustomerSchema);
