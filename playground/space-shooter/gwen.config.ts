/**
 * Space Shooter — Configuration GWEN
 *
 * Déclarez vos plugins ici. Les services qu'ils exposent sont automatiquement
 * disponibles avec autocomplétion dans tous vos systèmes.
 *
 * @example
 * ```typescript
 * onInit(api: EngineAPI<GwenServices>) {
 *   const kb  = api.services.get('keyboard');  // → KeyboardInput ✅
 *   const rdr = api.services.get('renderer');  // → Canvas2DRenderer ✅
 * }
 * ```
 */

import { defineConfig } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { HtmlUIPlugin } from '@gwen/plugin-html-ui';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';
import { DebugPlugin } from '@gwen/plugin-debug';
import type { DebugMetrics } from '@gwen/plugin-debug';

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
  tsPlugins: [
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
    // new DebugPlugin({
    //   overlay: { position: 'top-right' },
    //   fpsDrop: {
    //     threshold: 45,
    //     onDrop: (fps: number, metrics: DebugMetrics) => {
    //       console.warn(`[GWEN:Debug] FPS drop detected: ${fps.toFixed(0)} FPS (avg: ${metrics.rollingFps.toFixed(1)})`);
    //     },
    //   },
    // }),
  ],
});
