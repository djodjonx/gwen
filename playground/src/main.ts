/**
 * Space Shooter — Point d'entrée
 * Scaffoldé via create-gwen-app — aucun Rust requis pour le dev.
 */

import { initWasm, createEngine } from '@gwen/engine-core';
import { gwenConfig } from '../gwen.config';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';

async function bootstrap() {
  // 1. Core WASM obligatoire — servi depuis /wasm/ par @gwen/vite-plugin
  await initWasm();

  // 2. Engine + plugins déclarés dans gwen.config.ts
  const { engine, scenes } = createEngine(gwenConfig);

  // 3. Scènes
  scenes.register(new MainMenuScene(scenes));
  scenes.register(new GameScene(scenes));

  // 4. Scène initiale
  scenes.loadSceneImmediate('MainMenu', engine.getAPI());

  // 5. Go !
  engine.start();
}

bootstrap().catch(err => {
  console.error('[GWEN] Fatal:', err);
  document.body.innerHTML = `<pre style="color:red;padding:2rem">[GWEN] Fatal:\n${err}</pre>`;
});
