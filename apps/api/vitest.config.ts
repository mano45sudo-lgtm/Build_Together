import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Integration suites share one real PostgreSQL database and clear it between tests,
    // so files must run one at a time (a wipe in one file must not race another file's calls).
    fileParallelism: false,
  },
});
