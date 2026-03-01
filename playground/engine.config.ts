import { Engine, SceneManager, UIManager, defineConfig } from '@gwen/engine-core';
import type { GwenConfigServices } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

/**
 * Configuration GWEN — source de vérité unique du projet.
 *
 * Tous les plugins sont déclarés ici. Les services qu'ils exposent sont
 * automatiquement disponibles avec autocomplétion dans tout le projet.
 */
export const gwenConfig = defineConfig({
  maxEntities: 2000,
  targetFPS: 60,
  debug: false,
  plugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.7 }),
    new Canvas2DRenderer({ canvas: 'game-canvas', background: '#000814' }),
  ],
});

/**
 * Type global des services disponibles dans ce projet.
 * Inféré automatiquement depuis gwenConfig.
 *
 * Dans n'importe quel système :
 * ```typescript
 * onInit(api: EngineAPI<GwenServices>) {
 *   const kb  = api.services.get('keyboard');  // → KeyboardInput   ✅
 *   const au  = api.services.get('audio');     // → AudioPlugin      ✅
 *   const rdr = api.services.get('renderer');  // → Canvas2DRenderer ✅
 * }
 * ```
 */
export type GwenServices = GwenConfigServices<typeof gwenConfig>;

// ── Instances globales ────────────────────────────────────────────────────────

export const engine = new Engine({ maxEntities: 2000, targetFPS: 60, debug: false });
export const scenes = new SceneManager();

export function configureEngine() {
  engine.registerSystem(scenes);
  engine.registerSystem(new UIManager());
  engine.registerSystem(new InputPlugin());
  engine.registerSystem(new AudioPlugin({ masterVolume: 0.7 }));
  engine.registerSystem(new Canvas2DRenderer({ canvas: 'game-canvas', background: '#000814' }));
  return { engine, scenes };
}
