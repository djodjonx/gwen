import { defineConfig } from '@gwen/engine-core';
import type { GwenConfigServices } from '@gwen/engine-core';

/**
 * Configuration de votre jeu GWEN.
 *
 * Ajoutez vos plugins dans `plugins` — les services qu'ils exposent
 * sont automatiquement disponibles avec autocomplétion dans vos systèmes.
 *
 * ```typescript
 * // Dans un système, après avoir ajouté InputPlugin :
 * onInit(api: EngineAPI<GwenServices>) {
 *   const kb = api.services.get('keyboard'); // → KeyboardInput ✅
 * }
 * ```
 */
export const gwenConfig = defineConfig({
  engine: {
    maxEntities: 10_000,
    targetFPS: 60,
    debug: false,
  },

  // Plugins TypeScript — légers, DOM-natifs
  // Chaque plugin déclare ses services → autocomplétion garantie
  plugins: [
    // new InputPlugin(),       // expose: keyboard, mouse, gamepad
    // new AudioPlugin(),       // expose: audio
    // new Canvas2DRenderer(),  // expose: renderer
  ],

  // Plugins WASM — haute performance (physique, IA, ...)
  // wasmPlugins: [Physics2D()],
});

/**
 * Type global des services disponibles dans ce projet.
 * Inféré automatiquement depuis gwenConfig.
 * Exportez-le et utilisez-le pour typer vos systèmes.
 */
export type GwenServices = GwenConfigServices<typeof gwenConfig>;
