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
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export default defineConfig({
  engine: {
    maxEntities: 2_000,
    targetFPS: 60,
    debug: false,
  },
  html: {
    title: 'GWEN — Space Shooter',
    canvasId: 'game-canvas',
    canvasWidth: 480,
    canvasHeight: 640,
    background: '#000814',
    overlay: `
      <div id="ui" style="position:absolute;top:16px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;font-family:'Courier New',monospace;color:#4fffb0;">
        <div id="score" style="font-size:20px;letter-spacing:2px;text-shadow:0 0 8px #4fffb0">SCORE: 0</div>
        <div id="lives" style="font-size:14px;color:#ff6b6b;margin-top:4px">♥ ♥ ♥</div>
      </div>
    `,
  },
  plugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.7 }),
    new Canvas2DRenderer({ canvas: 'game-canvas', background: '#000814', pixelRatio: 1, manualRender: true }),
  ],
});


