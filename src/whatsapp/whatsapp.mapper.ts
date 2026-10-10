import { toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type {
  WhatsappMessage,
  WhatsappStatus,
  WhatsappTemplate,
} from './schemas/whatsapp-message.schema';

/** Never includes the message params (they may hold a temporary password). */
export interface WhatsappMessageResponse {
  id: string;
  leadId: string | null;
  customerId: string;
  phone: string;
  template: WhatsappTemplate;
  status: WhatsappStatus;
  error: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toWhatsappMessageResponse(m: WhatsappMessage): WhatsappMessageResponse {
  return {
    id: idOf(m._id)!,
    leadId: idOf(m.leadId),
    customerId: idOf(m.customerId)!,
    phone: m.phone,
    template: m.template,
    status: m.status,
    error: m.error ?? null,
    attempts: m.attempts ?? 0,
    sentAt: toIso(m.sentAt),
    createdAt: toIso(m.createdAt),
    updatedAt: toIso(m.updatedAt),
  };
}
