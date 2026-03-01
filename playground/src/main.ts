/**
 * Playground — Space Shooter entry point
 * Montre l'assemblage complet du framework GWEN.
 */

import { Engine, SceneManager } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';

// 1. Créer le moteur
const engine = new Engine({
  maxEntities: 2000,
  targetFPS: 60,
  debug: false,
});

// 2. SceneManager — enregistrer en premier
const scenes = new SceneManager();
engine.registerSystem(scenes);

// 3. Input — capture en onBeforeUpdate (step 1 du game loop)
engine.registerSystem(new InputPlugin());

// 4. Scènes
scenes
  .register(new MainMenuScene(scenes))
  .register(new GameScene(scenes));

// 5. Démarrer sur le menu
scenes.loadSceneImmediate('MainMenu', engine.getAPI());

// 6. Lancer la boucle
engine.start();

// Debug panel (DEV only)
if (import.meta.env.DEV) {
  setInterval(() => {
    const s = engine.getStats();
    console.log(`[GWEN] FPS:${s.fps} | Entities:${s.entityCount} | Frame:${s.frameCount}`);
  }, 3000);
}
