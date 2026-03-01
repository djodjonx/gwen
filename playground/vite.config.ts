import { defineConfig } from 'vite';
import { resolve } from 'path';
import { gwen } from '../packages/@gwen/vite-plugin/src/index.ts';

export default defineConfig({
  root: '.',
  plugins: [
    gwen({
      cratePath: '../crates/gwen-core',
      wasmOutDir: 'public/wasm',
      watch: true,
      verbose: false,
    }),
  ],
  resolve: {
    alias: {
      '@gwen/engine-core': resolve(__dirname, '../packages/@gwen/engine-core/src/index.ts'),
      '@gwen/renderer-canvas2d': resolve(__dirname, '../packages/@gwen/renderer-canvas2d/src/index.ts'),
      '@gwen/plugin-input': resolve(__dirname, '../packages/@gwen/plugin-input/src/index.ts'),
      '@gwen/plugin-audio': resolve(__dirname, '../packages/@gwen/plugin-audio/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    open: false,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'esnext',
  },
});
