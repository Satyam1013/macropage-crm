import { testMongoUri } from './utils/mongo-uri';

// Runs before each test file is loaded (so before AppModule's ConfigModule validates the env).
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.THROTTLE_LIMIT = '1000';
// Fresh database per test file on the shared in-memory replica set.
if (process.env.MONGO_TEST_BASE_URI) process.env.MONGODB_URI = testMongoUri('test');
