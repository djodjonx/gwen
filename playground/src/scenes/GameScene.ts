import type { Scene, EngineAPI, SceneManager, GwenPlugin } from '@gwen/engine-core';
import { UIComponent, UIManager } from '@gwen/engine-core';
import { PlayerPrefab, EnemyPrefab, BulletPrefab } from '../prefabs';
import { Score } from '../components';
import { MovementSystem }        from '../systems/MovementSystem';
import { makePlayerSystem }      from '../systems/PlayerSystem';
import { AiSystem }              from '../systems/AiSystem';
import { SpawnerSystem }         from '../systems/SpawnerSystem';
import { makeCollisionSystem }   from '../systems/CollisionSystem';
import { makeRenderSystem }      from '../systems/RenderSystem';
import { ScoreUI }               from '../ui/ScoreUI';

export class GameScene implements Scene {
  readonly name = 'Game';
  readonly plugins: GwenPlugin[];

  constructor(private scenes: SceneManager) {
    const hudManager = new UIManager();
    hudManager.register(ScoreUI);

    this.plugins = [
      MovementSystem,
      makePlayerSystem(this.scenes),
      AiSystem,
      SpawnerSystem,
      makeCollisionSystem(this.scenes),
      makeRenderSystem(),
      hudManager,
    ];
  }

  onEnter(api: EngineAPI<GwenServices>) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(BulletPrefab);

    // Entité score — UIComponent attache ScoreUI à cette entité
    const scoreId = api.createEntity();
    api.addComponent(scoreId, Score, { value: 0, lives: 3 });
    api.addComponent(scoreId, UIComponent, { uiName: 'ScoreUI' });

    api.prefabs.instantiate('Player');

    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 90;
      api.prefabs.instantiate('Enemy', x, -30 - i * 15);
    }
  }

  onUpdate() {}
  onRender() {}
  onExit() {}
}
