/**
 * Space Shooter — Point d'entrée
 * Scaffoldé via create-gwen-app — aucun Rust requis pour le dev.
 *
 * Les scènes sont auto-découvertes depuis src/scenes/ par `gwen prepare`.
 * Le fichier .gwen/scenes.ts est généré automatiquement — ne pas modifier.
 */

import { initWasm, createEngine } from '@gwen/engine-core';
import gwenConfig from '../gwen.config';
import { registerScenes, mainScene } from '../.gwen/scenes';

async function bootstrap() {
  // 1. Core WASM obligatoire — servi depuis /wasm/ par @gwen/vite-plugin
  await initWasm();

  // 2. Engine + plugins + scènes auto-chargées depuis .gwen/scenes.ts
  const { engine } = createEngine(gwenConfig, registerScenes, mainScene);

  // 3. Go !
  engine.start();
}

bootstrap().catch(err => {
  console.error('[GWEN] Fatal:', err);
  document.body.innerHTML = `<pre style="color:red;padding:2rem">[GWEN] Fatal:\n${err}</pre>`;
});
