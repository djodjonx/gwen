import { defineConfig } from '@gwen/engine-core';

/**
 * Configuration de votre jeu GWEN.
 * Choisissez vos plugins, ajustez les paramètres du moteur.
 */
export default defineConfig({
  engine: {
    maxEntities: 10_000,
    targetFPS: 60,
    debug: false,
  },

  // Plugins TypeScript — légers, DOM-natifs
  plugins: [],

  // Plugins WASM — haute performance (physique, IA, ...)
  // wasmPlugins: [Physics2D()],
});

