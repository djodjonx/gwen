import { defineConfig } from 'vite';
import { gwen } from '@gwen/vite-plugin';

export default defineConfig({
  plugins: [
    // Plugin GWEN : sert les fichiers WASM, hot-reload Rust en dev
    gwen(),
  ],
  build: {
    target: 'esnext',
  },
  server: {
    port: 3000,
    headers: {
      // Requis pour SharedArrayBuffer (WASM threads)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
