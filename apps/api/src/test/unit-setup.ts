// Unit tests may import env.ts but must never connect to PostgreSQL. Keep a clearly test-only
// inert URL here; only integration tests read TEST_DATABASE_URL and only resetDb() connects.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://unit:unit@127.0.0.1:5432/cue_unit_test';
process.env.SESSION_SECRET ??= 'test-only-insecure-secret';
