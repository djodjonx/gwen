import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@gwenjs/app': resolve(__dirname, '../app/src/index.ts'),
      '@gwenjs/core': resolve(__dirname, '../core/src/index.ts'),
      '@gwenjs/kit': resolve(__dirname, '../kit/src/index.ts'),
      '@gwenjs/schema': resolve(__dirname, '../schema/src/index.ts'),
      '@gwenjs/vite': resolve(__dirname, '../vite/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
