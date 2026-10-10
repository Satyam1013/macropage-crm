import { Injectable, Logger } from '@nestjs/common';

/**
 * Transport for WhatsApp messages. Bind a real implementation (WhatsApp Business Cloud API,
 * Twilio, Gupshup…) in WhatsappModule; throwing marks the attempt FAILED and schedules a retry.
 */
export abstract class WhatsappProvider {
  abstract send(phone: string, body: string): Promise<{ providerMessageId: string | null }>;
}

/** Development stub: logs the message instead of sending it. */
@Injectable()
export class LogWhatsappProvider extends WhatsappProvider {
  private readonly logger = new Logger('WhatsApp');

  send(phone: string, body: string): Promise<{ providerMessageId: string | null }> {
    // The body may contain a temporary password: log only its length.
    this.logger.log(`[stub] message to +${phone} (${body.length} chars) not actually sent`);
    return Promise.resolve({ providerMessageId: null });
  }
}
