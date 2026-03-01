import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve workspace package directly from source during tests
      '@gwen/engine-core': resolve(__dirname, '../engine-core/src/index.ts'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GwenRendererCanvas2D',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['@gwen/engine-core'],
      output: {
        globals: { '@gwen/engine-core': 'GwenEngineCore' },
      },
    },
  },
});
