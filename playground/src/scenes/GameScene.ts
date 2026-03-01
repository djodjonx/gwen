import type { Scene, EngineAPI, SceneManager } from '@gwen/engine-core';
import type { GwenServices } from '../../gwen.config';
import { PlayerPrefab, EnemyPrefab, BulletPrefab } from '../prefabs';
import { Score } from '../components';
import { MovementSystem }  from '../systems/MovementSystem';
import { makePlayerSystem } from '../systems/PlayerSystem';
import { AiSystem }         from '../systems/AiSystem';
import { SpawnerSystem }    from '../systems/SpawnerSystem';
import { makeCollisionSystem } from '../systems/CollisionSystem';
import { makeRenderSystem } from '../systems/RenderSystem';
import { HudSystem }        from '../systems/HudSystem';

export class GameScene implements Scene {
  readonly name = 'Game';

  /** Plugins actifs uniquement pendant cette scène */
  readonly plugins = [
    MovementSystem,
    makePlayerSystem(this.scenes),
    AiSystem,
    SpawnerSystem,
    makeCollisionSystem(this.scenes),
    makeRenderSystem(),
    HudSystem,
  ];

  constructor(private scenes: SceneManager) {}

  onEnter(api: EngineAPI<GwenServices>) {
    // Enregistrer les prefabs
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(BulletPrefab);

    // Entité score globale
    const scoreId = api.createEntity();
    api.addComponent(scoreId, Score, { value: 0, lives: 3 });

    // Joueur
    api.prefabs.instantiate('Player');

    // Première vague d'ennemis
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 90;
      api.prefabs.instantiate('Enemy', x, -30 - i * 15);
    }
  }

  onUpdate() {}
  onRender() {}
  onExit() {}
}

