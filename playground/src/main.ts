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

// 4. Activation du core Rust/WASM (optionnel — fallback TS-only si absent)
initWasm('/wasm/gwen_core.js', '/wasm/gwen_core_bg.wasm', 2000).then(active => {
  if (active) {
    console.log('[GWEN] WASM core active — Rust ECS bridged');
  }
});

// 5. Lancement de la boucle
engine.start();
