import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_SCOPES,
  ExpenseCategory,
  ExpenseScope,
} from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';
import { expenseScopeError } from '../expense-scope';

/**
 * Booked against a client Project, an InternalProject, the company, or the owner (`scope`).
 * Which of projectId / internalProjectId / staffId must be set depends on the scope; see
 * expenseScopeError.
 */
@Schema({ timestamps: true, collection: 'expenses' })
export class Expense extends BaseEntity {
  @Prop({ type: String, enum: EXPENSE_SCOPES, default: 'PROJECT' })
  scope: ExpenseScope;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'InternalProject', default: null })
  internalProjectId?: Types.ObjectId | null;

  /** The staff member the expense belongs to (exposed as `userId`); optional for COMPANY / OWNER. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Staff', default: null })
  staffId?: Types.ObjectId | null;

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
ExpenseSchema.pre('validate', function (next) {
  const error = expenseScopeError(this.scope, this);
  next(error ? new Error(error) : undefined);
});
ExpenseSchema.index({ projectId: 1, spentOn: -1 });
ExpenseSchema.index(
  { internalProjectId: 1, spentOn: -1 },
  { partialFilterExpression: { internalProjectId: { $type: 'objectId' } } },
);
ExpenseSchema.index({ scope: 1, spentOn: -1 });
ExpenseSchema.index({ category: 1, spentOn: -1 });
ExpenseSchema.index({ staffId: 1, spentOn: -1 });
ExpenseSchema.index({ spentOn: -1 });
applyCommonPlugins(ExpenseSchema, { dateOnly: ['spentOn'] });
