import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { Role, ROLES } from '../../common/constants/enums';
import { BaseEntity } from '../../common/schemas/base.entity';
import { applyCommonPlugins } from '../../common/schemas/apply-plugins';

@Schema({ timestamps: true, collection: 'users' })
export class User extends BaseEntity {
  @Prop({ required: true, trim: true })
  name: string;

  /** Required for ADMIN users. Optional for CUSTOMER users, who sign in with their customer's phone. */
  @Prop({ type: String, default: null, lowercase: true, trim: true })
  email?: string | null;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: ROLES, required: true })
  role: Role;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', default: null })
  customerId?: Types.ObjectId | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, default: null, select: false })
  refreshTokenHash?: string | null;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ role: 1, customerId: 1 });
UserSchema.index(
  { email: 1 },
  { unique: true, name: 'email_unique', partialFilterExpression: { email: { $type: 'string' } } },
);
applyCommonPlugins(UserSchema);
