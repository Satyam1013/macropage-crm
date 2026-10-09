import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PAYMENT_MODES, PaymentMode } from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';

@Schema({ timestamps: true, collection: 'payments' })
export class Payment extends BaseEntity {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Date, required: true })
  paidOn: Date;

  @Prop({ type: String, enum: PAYMENT_MODES, required: true })
  mode: PaymentMode;

  @Prop({ type: String, default: null })
  note?: string | null;
}

export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ projectId: 1, paidOn: -1 });
PaymentSchema.index({ paidOn: -1 });
applyCommonPlugins(PaymentSchema, { dateOnly: ['paidOn'] });
