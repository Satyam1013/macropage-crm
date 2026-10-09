import { toIso } from '../common/utils/date.util';
import { idOf } from '../common/utils/object-id.util';
import type { User } from './schemas/user.schema';

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  customerId: string | null;
  customerName?: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Never includes `passwordHash` / `refreshTokenHash`, regardless of what was selected. */
export function toUserResponse(user: User, customerName?: string | null): UserResponse {
  const out: UserResponse = {
    id: idOf(user._id)!,
    name: user.name,
    email: user.email,
    role: user.role,
    customerId: idOf(user.customerId),
    isActive: user.isActive,
    createdAt: toIso(user.createdAt),
    updatedAt: toIso(user.updatedAt),
  };
  if (customerName !== undefined) out.customerName = customerName;
  return out;
}
