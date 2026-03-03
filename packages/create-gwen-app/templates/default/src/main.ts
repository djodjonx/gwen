/**
 * {{PROJECT_NAME}} — Point d'entrée principal
 *
 * Le moteur WASM est chargé automatiquement depuis @gwen/engine-core.
 * Aucune configuration de chemins nécessaire.
 */

import { createEngine, initWasm } from '@gwen/engine-core';
import { gwenConfig } from '../gwen.config';
import { MainScene } from './scenes/MainScene';

// 1. Initialiser le cœur WASM (optionnel — fallback JS si non disponible)
await initWasm();

// 2. Créer le moteur depuis la config (plugins enregistrés automatiquement)
const { engine, scenes } = createEngine(gwenConfig);

// 3. Enregistrer et charger la première scène
scenes.register(MainScene);
scenes.loadSceneImmediate('MainScene', engine.getAPI());

// 4. Démarrer la boucle de jeu
engine.start();
