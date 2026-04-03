import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // NOTE: more-specific sub-path aliases MUST come before the generic package alias.
      // Vite/Rollup alias matching is ordered: the first match wins (prefix replacement).
      // If '@gwenjs/app' appeared first it would match '@gwenjs/app/resolve' as a prefix
      // and produce '…/index.ts/resolve' (ENOTDIR).
      '@gwenjs/app/resolve': resolve(__dirname, '../app/src/resolve.ts'),
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
