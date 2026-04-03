import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: ['@gwenjs/input', '@gwenjs/ui'],
  engine: { targetFPS: 60, maxEntities: 100 },
});
