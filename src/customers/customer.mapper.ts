import { toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { Customer } from './schemas/customer.schema';

export interface CustomerResponse {
  id: string;
  name: string;
  contactName: string;
  email: string;
  /** Digits with country code, e.g. "919876543210"; '' when not set. */
  phone: string;
  address: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toCustomerResponse(c: Customer): CustomerResponse {
  return {
    id: idOf(c._id)!,
    name: c.name,
    contactName: c.contactName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? null,
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
  };
}
