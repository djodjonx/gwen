import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
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
      // Required for SharedArrayBuffer + WASM threads (future-proofing)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Ensure .wasm files in public/ are served with correct MIME type
  assetsInclude: ['**/*.wasm'],
  build: {
    target: 'esnext', // Required for top-level await + WASM
  },
});
