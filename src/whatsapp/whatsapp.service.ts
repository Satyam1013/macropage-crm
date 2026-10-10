import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';
import { toObjectId } from '../common/utils/object-id.util';
import type { EnvironmentVariables } from '../config/env.validation';
import { ListWhatsappMessagesQueryDto } from './dto/whatsapp.dto';
import { WhatsappMessage } from './schemas/whatsapp-message.schema';
import { toWhatsappMessageResponse, WhatsappMessageResponse } from './whatsapp.mapper';
import { WhatsappProvider } from './whatsapp.provider';
import { renderWhatsapp } from './whatsapp.templates';

const LOCK_MS = 60_000;
const BATCH = 25;
/** 30s, 1m, 2m, 4m… capped at 1h. */
const backoffMs = (attempts: number) => Math.min(30_000 * 2 ** (attempts - 1), 3_600_000);

export interface ClientInviteInput {
  leadId: string | null;
  customerId: string;
  phone: string;
  name: string;
  title: string;
  temporaryPassword: string | null;
  newAccount: boolean;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappService.name);
  private timer: NodeJS.Timeout | null = null;
  private draining: Promise<number> | null = null;

  constructor(
    @InjectModel(WhatsappMessage.name) private readonly messageModel: Model<WhatsappMessage>,
    private readonly provider: WhatsappProvider,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onModuleInit(): void {
    const every = this.config.get('WHATSAPP_POLL_MS', { infer: true });
    if (every > 0) {
      this.timer = setInterval(() => void this.processDue(), every);
      this.timer.unref();
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Queues a portal invite. Call after the business transaction commits: it never throws, so a
   * queue problem cannot fail the request that triggered it.
   */
  async enqueueClientInvite(input: ClientInviteInput): Promise<WhatsappMessageResponse | null> {
    try {
      const message = await this.messageModel.create({
        leadId: input.leadId,
        customerId: input.customerId,
        phone: input.phone,
        template: 'CLIENT_PORTAL_INVITE',
        params: {
          name: input.name,
          title: input.title,
          portalUrl: this.config.get('PORTAL_URL', { infer: true }),
          newAccount: input.newAccount,
          temporaryPassword: input.temporaryPassword,
        },
      });
      this.kick();
      return toWhatsappMessageResponse(message.toObject());
    } catch (err) {
      this.logger.error(`Could not queue WhatsApp invite for customer ${input.customerId}`, err);
      return null;
    }
  }

  async list(query: ListWhatsappMessagesQueryDto): Promise<WhatsappMessageResponse[]> {
    const filter: FilterQuery<WhatsappMessage> = {};
    if (query.leadId) filter.leadId = toObjectId(query.leadId);
    if (query.customerId) filter.customerId = toObjectId(query.customerId);
    if (query.status) filter.status = query.status;
    const rows = await this.messageModel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return rows.map(toWhatsappMessageResponse);
  }

  /** Re-queues a FAILED message now, with a fresh set of attempts. */
  async retry(id: string): Promise<WhatsappMessageResponse> {
    const message = await this.messageModel
      .findOneAndUpdate(
        { _id: id, status: 'FAILED' },
        { $set: { attempts: 0, nextAttemptAt: new Date(), lockedUntil: null } },
        { new: true },
      )
      .lean();
    if (!message) throw new NotFoundException('No FAILED message with this id');
    this.kick();
    return toWhatsappMessageResponse(message);
  }

  /** Sends every due message; returns how many were attempted. Safe to run on several instances. */
  processDue(): Promise<number> {
    this.draining ??= this.drain().finally(() => (this.draining = null));
    return this.draining;
  }

  private kick(): void {
    if (this.timer) setImmediate(() => void this.processDue());
  }

  private async drain(): Promise<number> {
    const maxAttempts = this.config.get('WHATSAPP_MAX_ATTEMPTS', { infer: true });
    let count = 0;
    while (count < BATCH) {
      const now = new Date();
      const message = await this.messageModel
        .findOneAndUpdate(
          {
            status: { $in: ['PENDING', 'FAILED'] },
            attempts: { $lt: maxAttempts },
            nextAttemptAt: { $lte: now },
            $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
          },
          { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
          { new: true, sort: { nextAttemptAt: 1 } },
        )
        .lean();
      if (!message) break;
      count++;
      await this.deliver(message, maxAttempts);
    }
    return count;
  }

  private async deliver(message: WhatsappMessage, maxAttempts: number): Promise<void> {
    try {
      const body = renderWhatsapp(message.template, message.params, message.phone);
      const { providerMessageId } = await this.provider.send(message.phone, body);
      await this.messageModel.updateOne(
        { _id: message._id },
        {
          $set: {
            status: 'SENT',
            sentAt: new Date(),
            providerMessageId,
            error: null,
            lockedUntil: null,
            'params.temporaryPassword': null,
          },
        },
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const exhausted = message.attempts >= maxAttempts;
      this.logger.warn(
        `WhatsApp message ${String(message._id)} failed (attempt ${message.attempts}): ${error}`,
      );
      await this.messageModel.updateOne(
        { _id: message._id },
        {
          $set: {
            status: 'FAILED',
            error: error.slice(0, 1000),
            lockedUntil: null,
            nextAttemptAt: new Date(Date.now() + backoffMs(message.attempts)),
            // Don't keep a password around for a message that won't be retried automatically.
            ...(exhausted ? { 'params.temporaryPassword': null } : {}),
          },
        },
      );
    }
  }
}
