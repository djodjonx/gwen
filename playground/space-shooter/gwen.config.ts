import { defineConfig } from '@gwenjs/app';
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d';

export default defineConfig({
  modules: ['@gwenjs/physics2d', '@gwenjs/input', '@gwenjs/audio', '@gwenjs/debug'],
  plugins: [Canvas2DRenderer({ width: 480, height: 640, background: '#000814' })],
  engine: { maxEntities: 2000, targetFPS: 60 },
});
