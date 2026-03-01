/**
 * Point d'entrée GWEN — Space Shooter
 * Assemblage final minimaliste selon ENGINE.md
 */

import { initWasm } from '@gwen/engine-core';
import { configureEngine, engine, scenes } from '../engine.config';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';

// 1. Configuration des services globaux
configureEngine();

// 2. Enregistrement des scènes
scenes.register(new MainMenuScene(scenes));
scenes.register(new GameScene(scenes));

// 3. Choix de la scène de départ
scenes.loadSceneImmediate('MainMenu', engine.getAPI());

// 4. Activation du core Rust/WASM — résolution automatique depuis @gwen/engine-core/wasm/
//    L'utilisateur n'a pas besoin de connaître les chemins ni d'avoir Rust installé.
//    Fallback transparent en TS-only si le WASM n'est pas disponible.
initWasm().then(active => {
  if (active) {
    console.log('[GWEN] WASM core active — Rust ECS bridged');
  } else {
    console.log('[GWEN] Running in TS-only mode');
  }
});

// 5. Lancement de la boucle
engine.start();
