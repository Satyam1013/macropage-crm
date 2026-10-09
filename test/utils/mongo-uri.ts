import { randomBytes } from 'crypto';

/** URI for a fresh, uniquely named database on the shared in-memory replica set. */
export function testMongoUri(prefix: string): string {
  const base = process.env.MONGO_TEST_BASE_URI;
  if (!base) throw new Error('MONGO_TEST_BASE_URI is not set (jest globalSetup did not run)');
  const url = new URL(base);
  url.pathname = `/${prefix}_${randomBytes(4).toString('hex')}`;
  return url.toString();
}
