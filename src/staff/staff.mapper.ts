import { toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { Staff } from './schemas/staff.schema';

export interface StaffResponse {
  id: string;
  name: string;
  role: string;
  type: Staff['type'];
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export function toStaffResponse(s: Staff): StaffResponse {
  return {
    id: idOf(s._id)!,
    name: s.name,
    role: s.role,
    type: s.type,
    email: s.email ?? null,
    phone: s.phone ?? null,
    isActive: s.isActive,
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
  };
}
