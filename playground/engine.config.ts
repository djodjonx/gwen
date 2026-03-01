import { Engine, SceneManager, UIManager } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';

/**
 * GWEN Engine Configuration
 * Déclaration des plugins capitaux et configuration de l'ECS
 */

export const engine = new Engine({
  maxEntities: 2000,
  targetFPS: 60,
  debug: false,
});

export const scenes = new SceneManager();

export function configureEngine() {
  // 1. SceneManager — enregistrer en premier pour la préséance des événements
  engine.registerSystem(scenes);

  // 2. UI System — gère l'orchestration des defineUI
  engine.registerSystem(new UIManager());

  // 3. InputPlugin — écoute du clavier / souris
  engine.registerSystem(new InputPlugin());

  return { engine, scenes };
}
