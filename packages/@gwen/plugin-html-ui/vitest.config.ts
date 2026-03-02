import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@gwen/engine-core': path.resolve(__dirname, '../engine-core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
  },
});
