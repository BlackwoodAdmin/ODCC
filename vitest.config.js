import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@server': path.resolve(process.cwd(), 'server'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    // Tests share the database and some mutate globals (Stripe stubs). Run serially.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
