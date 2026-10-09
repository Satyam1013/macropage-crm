import { SetMetadata } from '@nestjs/common';
import type { Role } from '../constants/enums';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route/controller to the given roles. Routes without `@Roles` default to ADMIN only,
 * so CUSTOMER logins can reach only endpoints that explicitly allow them (`/portal/*`, `/auth/*`).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
