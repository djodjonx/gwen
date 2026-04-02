/**
 * Space Shooter — GWEN Configuration
 */

import { defineConfig } from '@gwenjs/kit';
import { InputPlugin } from '@gwenjs/input';
import { AudioPlugin } from '@gwenjs/audio';
import { HtmlUIPlugin } from '@gwenjs/ui';
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d';
import { Physics2DPlugin } from '@gwenjs/physics2d';

export default defineConfig({
  engine: {
    maxEntities: 2_000,
    targetFPS: 60,
    debug: false,
  },
  html: {
    title: 'GWEN — Space Shooter',
    background: '#000814',
  },
  plugins: [
    Physics2DPlugin({
      gravity: 0,
      gravityX: 0,
      maxEntities: 2_000,
    }),
    InputPlugin(),
    AudioPlugin({ masterVolume: 0.7 }),
    Canvas2DRenderer({
      width: 480,
      height: 640,
      background: '#000814',
      pixelRatio: 1,
      manualRender: true,
    }),
    HtmlUIPlugin(),
  ],
});
