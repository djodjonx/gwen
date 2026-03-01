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
import type { GwenConfigServices } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export const gwenConfig = defineConfig({
  engine: {
    maxEntities: 2_000,
    targetFPS: 60,
    debug: false,
  },
  plugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.7 }),
    new Canvas2DRenderer({ canvas: 'game-canvas', background: '#000814' }),
  ],
});

/**
 * Type global des services — inféré automatiquement depuis gwenConfig.
 * Importez-le dans vos systèmes pour un typage complet sans cast.
 */
export type GwenServices = GwenConfigServices<typeof gwenConfig>;

