/**
 * Space Shooter — GWEN Configuration
 */

import { defineConfig } from '@gwenengine/kit';
import { InputPlugin } from '@gwenengine/input';
import { AudioPlugin } from '@gwenengine/audio';
import { HtmlUIPlugin } from '@gwenengine/ui';
import { Canvas2DRenderer } from '@gwenengine/renderer-canvas2d';
import { Physics2DPlugin } from '@gwenengine/physics2d';

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
