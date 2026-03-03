import { defineConfig } from '@gwen/engine-core';

/**
 * Configuration de votre jeu GWEN.
 *
 * Ajoutez vos plugins dans `tsPlugins` — les services qu'ils exposent
 * sont automatiquement disponibles avec autocomplétion dans vos systèmes,
 * sans aucune annotation explicite après `gwen prepare`.
 *
 * ```typescript
 * // Dans un système — aucune annotation nécessaire après gwen prepare :
 * onUpdate(api, dt) {
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
  tsPlugins: [
    // new InputPlugin(),       // expose: keyboard, mouse, gamepad
    // new AudioPlugin(),       // expose: audio
    // new Canvas2DRenderer(),  // expose: renderer
  ],

  // Plugins WASM — haute performance (physique, IA, ...)
  // wasmPlugins: [Physics2D()],
});
