/**
 * Scène de jeu — Space Shooter
 * Remaniée avec les DSLs GWEN et une architecture System / Prefab propre.
 */

import { Scene, EngineAPI, SceneManager, UIComponent, type TsPlugin } from '@gwen/engine-core';

// Composants
import { COMPONENTS as C, type ScoreData } from '../components';

// UI
import { HUD } from '../ui/HUD.ui';

// Prefabs
import { PlayerPrefab } from '../prefabs/Player.prefab';
import { EnemyPrefab } from '../prefabs/Enemy.prefab';
import { BulletPrefab } from '../prefabs/Bullet.prefab';

// Systèmes Locaux (Plugins de Scène)
import { PlayerControllerSystem } from '../systems/PlayerController.system';
import { MovementSystem } from '../systems/Movement.system';
import { AiControllerSystem } from '../systems/AiController.system';
import { SpawnerSystem } from '../systems/Spawner.system';
import { CollisionSystem } from '../systems/Collision.system';
import { RenderSystem } from '../systems/Render.system';


export class GameScene implements Scene {
  readonly name = 'Game';

  // Utilisation de la nouvelle API de Scene (Phase K)
  // Ces plugins seront montés uniquement lorsque la scène tourne.
  readonly plugins: TsPlugin[];

  constructor(scenes: SceneManager) {
    this.plugins = [
      new PlayerControllerSystem(),
      new AiControllerSystem(),
      new SpawnerSystem(),
      new MovementSystem(),
      new CollisionSystem(scenes),
      new RenderSystem()
    ];
  }

  onEnter(api: EngineAPI): void {
    // 1. Enregistrement des Prefabs
    api.prefabs
      .register(PlayerPrefab)
      .register(EnemyPrefab)
      .register(BulletPrefab);

    // 2. Enregistrement de l'UI globale
    const uiManager = api.services.get<any>('PluginManager').get('UIManager');
    if (uiManager) uiManager.register(HUD);

    // 3. Initialisation du Score & HUD (Entité Singleton)
    const scoreEntity = api.createEntity();
    api.addComponent<ScoreData>(scoreEntity, C.SCORE, { value: 0, lives: 3 });
    api.addComponent(scoreEntity, UIComponent, { uiName: HUD.name });

    // 4. Instantiation du Joueur
    api.prefabs.instantiate('Player');
  }

  onExit(_api: EngineAPI): void {
    // Les entités sont automatiquement purgées par le SceneManager
    // Les TsPlugins locaux sont automatiquement démontés par le PluginRegistrar
  }
}
