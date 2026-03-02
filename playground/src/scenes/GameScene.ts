import type { Scene, EngineAPI, SceneManager, GwenPlugin } from '@gwen/engine-core';
import { UIComponent, UIManager } from '@gwen/engine-core';
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
  readonly plugins: GwenPlugin[];

  constructor(private scenes: SceneManager) {
    const hudManager = new UIManager();
    hudManager
      .register(BackgroundUI)  // 1er — clear + étoiles
      .register(BulletUI)      // 2e  — balles (sous les vaisseaux)
      .register(EnemyUI)       // 3e  — ennemis
      .register(PlayerUI)      // 4e  — joueur (au dessus des ennemis)
      .register(ScoreUI);      // 5e  — HUD HTML (au dessus de tout)

    this.plugins = [
      MovementSystem,
      makePlayerSystem(this.scenes),
      AiSystem,
      SpawnerSystem,
      makeCollisionSystem(this.scenes),
      hudManager,              // plus de makeRenderSystem()
    ];
  }

  onEnter(api: EngineAPI<GwenServices>) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(BulletPrefab);

    // Entité background — BackgroundUI dessine le fond + étoiles
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

  onUpdate() {}
  onRender() {}
  onExit() {}
}
