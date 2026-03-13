import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: true })],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        core: resolve(__dirname, 'src/core.ts'),
        helpers: resolve(__dirname, 'src/helpers.ts'),
        tilemap: resolve(__dirname, 'src/tilemap.ts'),
        debug: resolve(__dirname, 'src/debug.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['@djodjonx/gwen-engine-core', '@djodjonx/gwen-kit'],
      output: {
        globals: {
          '@djodjonx/gwen-engine-core': 'GwenEngineCore',
          '@djodjonx/gwen-kit': 'GwenKit',
        },
      },
    },
  },
});
