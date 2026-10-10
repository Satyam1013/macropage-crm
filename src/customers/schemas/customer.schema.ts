import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';
import { normalizePhone, NORMALIZED_PHONE } from '../../common/utils/phone.util';

@Schema({ timestamps: true, collection: 'customers' })
export class Customer extends BaseEntity {
  /** Company name. */
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true, default: '' })
  contactName: string;

  @Prop({ trim: true, lowercase: true, default: '' })
  email: string;

  /**
   * Portal login id: digits with country code (e.g. "919876543210"), unique among live
   * customers. Null for customers without a phone (they can't sign in by phone).
   */
  @Prop({
    type: String,
    default: null,
    set: (v: unknown) => (v === '' || v == null ? null : (normalizePhone(v) ?? v)),
    validate: {
      validator: (v: string | null) => v === null || NORMALIZED_PHONE.test(v),
      message: 'phone must be a valid phone number',
    },
  })
  phone?: string | null;

  @Prop({ type: String, trim: true, default: null })
  address?: string | null;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ name: 1 });
// A soft-deleted customer releases its phone.
CustomerSchema.index(
  { phone: 1 },
  {
    unique: true,
    name: 'phone_unique_live',
    partialFilterExpression: { phone: { $type: 'string' }, deletedAt: { $type: 'null' } },
  },
);
applyCommonPlugins(CustomerSchema);
