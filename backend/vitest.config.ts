import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      // env.ts validates on import, so it needs a dummy secret
      SESSION_SECRET: 'test-secret-test-secret-test-secret-0000',
      LOG_LEVEL: 'silent',
    },
    testTimeout: 20_000,
  },
});
