/**
 * {{PROJECT_NAME}} — Point d'entrée principal
 *
 * Le moteur WASM est chargé automatiquement depuis @djodjonx/gwen-engine-core.
 * Aucune configuration de chemins nécessaire.
 */

// Le template est validé dans le monorepo sans dépendances installées du projet généré.
// @ts-expect-error Résolu dans l'app scaffoldée via package.json du template.
import { createEngine, initWasm } from '@djodjonx/gwen-engine-core';
import { gwenConfig } from '../gwen.config';
import { MainScene } from './scenes/MainScene';

async function bootstrap(): Promise<void> {
  // 1. Initialiser le cœur WASM (optionnel — fallback JS si non disponible)
  await initWasm();

  // 2. Créer le moteur depuis la config (plugins enregistrés automatiquement)
  const { engine, scenes } = createEngine(gwenConfig);

  // 3. Enregistrer et charger la première scène
  scenes.register(MainScene);
  scenes.loadSceneImmediate('MainScene', engine.getAPI());

  // 4. Démarrer la boucle de jeu
  engine.start();
}

void bootstrap();
