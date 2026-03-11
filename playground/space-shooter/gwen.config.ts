/**
 * Space Shooter — Configuration GWEN
 *
 * Déclarez vos plugins ici. Les services qu'ils exposent sont automatiquement
 * disponibles avec autocomplétion dans tous vos systèmes.
 *
 * @example
 * ```typescript
 * onInit(api) {
 *   const kb = api.services.get('keyboard');  // → KeyboardInput ✅
 *   const rdr = api.services.get('renderer'); // → Canvas2DRendererService ✅
 * }
 * ```
 *
 * NOTE: Using legacy tsPlugins/wasmPlugins for now until CLI validator supports unified plugins format.
 * TODO: Migrate to unified `plugins: [...]` once validator is updated.
 */

import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
import { HtmlUIPlugin } from '@djodjonx/gwen-plugin-html-ui';
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';
import { Physics2DPlugin } from '@djodjonx/gwen-plugin-physics2d';

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
    new Physics2DPlugin({
      gravity: 0,
      gravityX: 0,
      maxEntities: 2_000,
    }),
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.7 }),
    new Canvas2DRenderer({
      width: 480,
      height: 640,
      background: '#000814',
      pixelRatio: 1,
      manualRender: true,
    }),
    new HtmlUIPlugin(),
  ],
});
