import { defineScene } from '@djodjonx/gwen-engine-core';

/**
 * MainScene — Scène principale de votre jeu.
 * Créez des entités dans onEnter(), utilisez des systèmes pour la logique.
 */
export const MainScene = defineScene({
  name: 'MainScene',

  onEnter(api) {
    // Créer quelques entités de démo
    for (let i = 0; i < 5; i++) {
      api.createEntity();
    }
    console.log('[MainScene] Initialized');
  },

  onExit() {
    console.log('[MainScene] Destroyed');
  },
});
