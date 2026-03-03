import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: true })],
  resolve: {
    alias: {
      '@gwen/engine-core': resolve(__dirname, '../engine-core/src/index.ts'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GwenPluginHtmlUI',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['@gwen/engine-core'],
      output: { globals: { '@gwen/engine-core': 'GwenEngineCore' } },
    },
  },
});
