import type { Scene, EngineAPI, SceneManager, GwenPlugin } from '@gwen/engine-core';
import { UIComponent } from '@gwen/engine-core';
import { PlayerPrefab, EnemyPrefab, BulletPrefab } from '../prefabs';
import { Score } from '../components';
import { MovementSystem }        from '../systems/MovementSystem';
import { makePlayerSystem }      from '../systems/PlayerSystem';
import { AiSystem }              from '../systems/AiSystem';
import { SpawnerSystem }         from '../systems/SpawnerSystem';
import { makeCollisionSystem }   from '../systems/CollisionSystem';
import { BackgroundUI }          from '../ui/BackgroundUI';
import { BulletUI }              from '../ui/BulletUI';
import { EnemyUI }               from '../ui/EnemyUI';
import { PlayerUI }              from '../ui/PlayerUI';
import { ScoreUI }               from '../ui/ScoreUI';

export class GameScene implements Scene {
  readonly name = 'Game';

  // Ordre de rendu déclaratif — le framework injecte UIManager automatiquement
  readonly ui = [
    BackgroundUI,  // 1er — clear + étoiles
    BulletUI,      // 2e  — balles (sous les vaisseaux)
    EnemyUI,       // 3e  — ennemis
    PlayerUI,      // 4e  — joueur
    ScoreUI,       // 5e  — HUD HTML (au dessus de tout)
  ];

  readonly plugins: GwenPlugin[];

  constructor(private scenes: SceneManager) {
    this.plugins = [
      MovementSystem,
      makePlayerSystem(this.scenes),
      AiSystem,
      SpawnerSystem,
      makeCollisionSystem(this.scenes),
    ];
  }

  onEnter(api: EngineAPI<GwenServices>) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(BulletPrefab);

    // Entité background
    const bgId = api.createEntity();
    api.addComponent(bgId, UIComponent, { uiName: 'BackgroundUI' });

    // Entité score (HUD HTML overlay)
    const scoreId = api.createEntity();
    api.addComponent(scoreId, Score,       { value: 0, lives: 3 });
    api.addComponent(scoreId, UIComponent, { uiName: 'ScoreUI' });

    // Joueur et ennemis — UIComponent déjà dans les prefabs
    api.prefabs.instantiate('Player');
    for (let i = 0; i < 5; i++) {
      api.prefabs.instantiate('Enemy', 60 + i * 90, -30 - i * 15);
    }
  }

  onExit() {}
}
