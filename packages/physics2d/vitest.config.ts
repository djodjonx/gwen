import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'bench/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/helpers/**', 'src/helpers-*.ts'],
      exclude: ['src/helpers/tilemap.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
  benchmark: {
    include: ['bench/**/*.bench.ts'],
  },
});
