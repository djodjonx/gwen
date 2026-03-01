import { Engine, SceneManager, UIManager, defineConfig } from '@gwen/engine-core';
import type { GwenConfigServices } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';

/**
 * Configuration GWEN du projet.
 *
 * defineConfig() infère automatiquement les services exposés par chaque plugin.
 * Utilisez `GwenServices` pour typer vos systèmes et scènes.
 */
export const gwenConfig = defineConfig({
  maxEntities: 2000,
  targetFPS: 60,
  debug: false,
  plugins: [
    new InputPlugin(),
    // new AudioPlugin(),
    // new Canvas2DRenderer({ canvas: 'game' }),
  ],
});

/**
 * Type des services disponibles dans ce projet.
 * Inféré automatiquement depuis gwenConfig — pas besoin de le déclarer manuellement.
 *
 * Utilisation dans un système :
 * ```typescript
 * onInit(api: EngineAPI<GwenServices>) {
 *   const kb = api.services.get('keyboard'); // → KeyboardInput ✅
 *   const ms = api.services.get('mouse');    // → MouseInput    ✅
 * }
 * ```
 */
export type GwenServices = GwenConfigServices<typeof gwenConfig>;

export const engine = new Engine({
  maxEntities: 2000,
  targetFPS: 60,
  debug: false,
});

export const scenes = new SceneManager();

export function configureEngine() {
  engine.registerSystem(scenes);
  engine.registerSystem(new UIManager());
  engine.registerSystem(new InputPlugin());
  return { engine, scenes };
}
