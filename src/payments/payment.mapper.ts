import type { PaymentMode } from '../common/constants/enums';
import { toDateOnly, toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { Payment } from './schemas/payment.schema';

export interface PaymentResponse {
  id: string;
  projectId: string | null;
  projectName?: string | null;
  amount: number;
  /** `paidOn` as YYYY-MM-DD. */
  date: string | null;
  mode: PaymentMode;
  note: string | null;
  createdAt: string | null;
}

export function toPaymentResponse(p: Payment, projectName?: string | null): PaymentResponse {
  return {
    id: idOf(p._id)!,
    projectId: idOf(p.projectId),
    ...(projectName !== undefined ? { projectName } : {}),
    amount: p.amount,
    date: toDateOnly(p.paidOn),
    mode: p.mode,
    note: p.note ?? null,
    createdAt: toIso(p.createdAt),
  };
}
