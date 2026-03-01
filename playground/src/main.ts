/**
 * Point d'entrée GWEN — Space Shooter
 */

import { initWasm } from '@gwen/engine-core';
import { configureEngine, engine, scenes } from '../engine.config';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';

async function bootstrap() {
  // 1. Charger le core Rust/WASM — obligatoire avant start()
  //    Résolution automatique depuis @gwen/engine-core/wasm/ (pas besoin de Rust)
  await initWasm();
  console.log('[GWEN] WASM core active — Rust ECS ready');

  // 2. Configurer les plugins globaux (Input, Audio, Renderer)
  configureEngine();

  // 3. Enregistrer les scènes
  scenes.register(new MainMenuScene(scenes));
  scenes.register(new GameScene(scenes));

  // 4. Scène de départ
  scenes.loadSceneImmediate('MainMenu', engine.getAPI());

  // 5. Lancer la boucle
  engine.start();
}

bootstrap().catch(err => {
  console.error('[GWEN] Fatal: failed to initialize engine', err);
});
