import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';

@Schema({ timestamps: true, collection: 'expenses' })
export class Expense extends BaseEntity {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  /** The staff member the expense belongs to (exposed as `userId`). */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Staff', required: true })
  staffId: Types.ObjectId;

  @Prop({ type: String, enum: EXPENSE_CATEGORIES, required: true })
  category: ExpenseCategory;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: Date, required: true })
  spentOn: Date;

  @Prop({ type: String, default: null })
  note?: string | null;
}

export type ExpenseDocument = HydratedDocument<Expense>;
export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ projectId: 1, spentOn: -1 });
ExpenseSchema.index({ category: 1, spentOn: -1 });
ExpenseSchema.index({ staffId: 1, spentOn: -1 });
ExpenseSchema.index({ spentOn: -1 });
applyCommonPlugins(ExpenseSchema, { dateOnly: ['spentOn'] });
