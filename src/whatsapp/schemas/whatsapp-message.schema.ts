import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { toJsonPlugin } from '../../common/plugins/to-json.plugin';

export const WHATSAPP_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type WhatsappStatus = (typeof WHATSAPP_STATUSES)[number];

export const WHATSAPP_TEMPLATES = ['CLIENT_PORTAL_INVITE'] as const;
export type WhatsappTemplate = (typeof WHATSAPP_TEMPLATES)[number];

/** Values rendered into the template at send time. */
@Schema({ _id: false })
export class WhatsappParams {
  @Prop({ type: String, default: '' })
  name: string;

  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: String, default: '' })
  portalUrl: string;

  /** A login was created for this message; its password is only kept until delivery ends. */
  @Prop({ default: false })
  newAccount: boolean;

  /** Removed once the message is SENT or has used up its attempts. Never returned by the API. */
  @Prop({ type: String, default: null })
  temporaryPassword?: string | null;
}
export const WhatsappParamsSchema = SchemaFactory.createForClass(WhatsappParams);

/**
 * Outbox + audit trail. Rows are written after the business transaction commits and drained by
 * WhatsappService's worker; FAILED rows are retried with backoff until `attempts` runs out.
 */
@Schema({ timestamps: true, collection: 'whatsapp_messages' })
export class WhatsappMessage {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Lead', default: null })
  leadId?: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true })
  customerId: Types.ObjectId;

  /** Normalised, digits with country code. */
  @Prop({ type: String, required: true })
  phone: string;

  @Prop({ type: String, enum: WHATSAPP_TEMPLATES, required: true })
  template: WhatsappTemplate;

  @Prop({ type: WhatsappParamsSchema, required: true })
  params: WhatsappParams;

  @Prop({ type: String, enum: WHATSAPP_STATUSES, default: 'PENDING' })
  status: WhatsappStatus;

  /** Last provider error. */
  @Prop({ type: String, default: null })
  error?: string | null;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Date, default: () => new Date() })
  nextAttemptAt: Date;

  /** Set while a worker is sending; a stale lock (crashed worker) expires on its own. */
  @Prop({ type: Date, default: null })
  lockedUntil?: Date | null;

  @Prop({ type: Date, default: null })
  sentAt?: Date | null;

  @Prop({ type: String, default: null })
  providerMessageId?: string | null;
}

export type WhatsappMessageDocument = HydratedDocument<WhatsappMessage>;
export const WhatsappMessageSchema = SchemaFactory.createForClass(WhatsappMessage);
WhatsappMessageSchema.index({ status: 1, nextAttemptAt: 1 });
WhatsappMessageSchema.index({ leadId: 1, createdAt: -1 });
WhatsappMessageSchema.index({ customerId: 1, createdAt: -1 });
WhatsappMessageSchema.plugin(toJsonPlugin);
