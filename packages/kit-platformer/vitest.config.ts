import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
  benchmark: {
    include: ['bench/**/*.bench.ts'],
  },
});
