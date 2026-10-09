import { MongoMemoryReplSet } from 'mongodb-memory-server';

/** One single-node in-memory replica set for the whole run (transactions need a replica set). */
export default async function globalSetup(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await replSet.waitUntilRunning();
  (globalThis as Record<string, unknown>).__MONGO_REPLSET__ = replSet;
  process.env.MONGO_TEST_BASE_URI = replSet.getUri();
}
