import { defineScene, UIComponent } from '@djodjonx/gwen-engine-core';
import { PlayerPrefab, EnemyPrefab, PlayerBulletPrefab, EnemyBulletPrefab } from '../prefabs';
import { Score } from '../components';
import { MovementSystem } from '../systems/MovementSystem';
import { PhysicsBindingSystem } from '../systems/PhysicsBindingSystem';
import { PlayerSystem } from '../systems/PlayerSystem';
import { AiSystem } from '../systems/AiSystem';
import { SpawnerSystem } from '../systems/SpawnerSystem';
import { BackgroundUI } from '../ui/BackgroundUI';
import { BulletUI } from '../ui/BulletUI';
import { EnemyUI } from '../ui/EnemyUI';
import { PlayerUI } from '../ui/PlayerUI';
import { ScoreUI } from '../ui/ScoreUI';

export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true,

  ui: [BackgroundUI, BulletUI, EnemyUI, PlayerUI, ScoreUI],

  // Collision gameplay is handled directly in prefab physics.onCollision callbacks.
  systems: [PlayerSystem, AiSystem, MovementSystem, PhysicsBindingSystem, SpawnerSystem],

  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(PlayerBulletPrefab);
    api.prefabs.register(EnemyBulletPrefab);

    const bgId = api.createEntity();
    api.addComponent(bgId, UIComponent, { uiName: 'BackgroundUI' });

    const scoreId = api.createEntity();
    api.addComponent(scoreId, Score, { value: 0, lives: 3 });
    api.addComponent(scoreId, UIComponent, { uiName: 'ScoreUI' });

    api.prefabs.instantiate('Player');
    for (let i = 0; i < 5; i++) {
      api.prefabs.instantiate('Enemy', 60 + i * 90, -30 - i * 15);
    }
  },

  onExit(_api) {},
}));
