/**
 * {{PROJECT_NAME}} — Point d'entrée principal
 *
 * Le moteur WASM est chargé automatiquement depuis @gwen/engine-core.
 * Aucune configuration de chemins nécessaire.
 */

import { getEngine, initWasm } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';
import { MainScene } from './scenes/MainScene';

// 1. Initialiser l'engine
const engine = getEngine({ maxEntities: 10_000, targetFPS: 60 });

// 2. Enregistrer les plugins
engine.registerSystem(new InputPlugin());
engine.registerSystem(new Canvas2DRenderer({ canvas: 'game', width: 800, height: 600 }));

// 3. Charger la première scène
const scene = new MainScene();
engine.registerSystem(scene);

// 4. Activer le cœur WASM (résolution automatique — pas besoin de Rust)
initWasm().then((active) => {
  if (active) console.log('[GWEN] WASM core active');
});

// 5. Démarrer la boucle
engine.start();
