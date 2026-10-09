import type { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  const replSet = (globalThis as Record<string, unknown>).__MONGO_REPLSET__ as
    MongoMemoryReplSet | undefined;
  await replSet?.stop();
}
