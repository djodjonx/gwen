import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync } from 'node:fs';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ include: ['src'], outDir: 'dist', rollupTypes: false }),
    {
      name: 'copy-vite-env-dts',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'src/vite-env.d.ts'),
          resolve(__dirname, 'dist/vite-env.d.ts'),
        );
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GwenPluginHtmlUI',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['@gwenjs/core'],
      output: { globals: { '@gwenjs/core': 'GwenEngineCore' } },
    },
  },
});
