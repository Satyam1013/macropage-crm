import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../constants/enums';

/** The authenticated principal attached to the request by JwtStrategy. */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  role: Role;
  customerId: string | null;
}

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<Request>().user as AuthUser | undefined;
    return field ? user?.[field] : user;
  },
);
