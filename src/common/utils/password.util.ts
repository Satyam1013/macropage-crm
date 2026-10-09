import { randomBytes } from 'crypto';

/** Readable random temporary password (12 chars, URL-safe). */
export function generateTemporaryPassword(): string {
  return randomBytes(9).toString('base64url');
}
