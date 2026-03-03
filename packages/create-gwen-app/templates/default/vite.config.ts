import { defineConfig } from 'vite';
import { gwen } from '@gwen/vite-plugin';

export default defineConfig({
  plugins: [
    gwen({
      watch: true,
      wasmMode: 'debug',
    }),
  ],
});

