/**
 * Point d'entrée GWEN — Space Shooter
 * Assemblage final minimaliste selon ENGINE.md
 */

import { configureEngine, engine, scenes } from '../engine.config';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';

// 1. Configuration des services globaux
configureEngine();

// 2. Enregistrement des scènes
scenes.register(new MainMenuScene());
scenes.register(new GameScene(scenes));

// 3. Choix de la scène de départ
scenes.loadScene('MainMenu', engine.getAPI());

// 4. Lancement de la boucle
engine.start();
