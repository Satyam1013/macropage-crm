import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';

/** Generic `{ from?, to, by, at }` entry used by leads and projects. */
@Schema({ _id: false })
export class StageHistoryEntry<TStage extends string = string> {
  @Prop({ type: String, default: null })
  from?: TStage | null;

  @Prop({ type: String, required: true })
  to: TStage;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  by: Types.ObjectId;

  @Prop({ type: Date, required: true })
  at: Date;
}

export const StageHistoryEntrySchema = SchemaFactory.createForClass(StageHistoryEntry);
