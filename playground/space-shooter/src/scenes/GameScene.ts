import { defineScene, UIComponent } from '@gwenjs/core';
import { createPhysicsKinematicSyncSystem } from '@gwenjs/physics2d';
import { PlayerPrefab, EnemyPrefab, PlayerBulletPrefab, EnemyBulletPrefab } from '../prefabs';
import { Score } from '../components';
import { MovementSystem } from '../systems/MovementSystem';
import { PlayerSystem } from '../systems/PlayerSystem';
import { AiSystem } from '../systems/AiSystem';
import { SpawnerSystem } from '../systems/SpawnerSystem';
import { ViewportSystem } from '../systems/ViewportSystem';
import { BackgroundUI } from '../ui/BackgroundUI';
import { BulletUI } from '../ui/BulletUI';
import { EnemyUI } from '../ui/EnemyUI';
import { PlayerUI } from '../ui/PlayerUI';
import { ScoreUI } from '../ui/ScoreUI';

const INITIAL_ENEMIES = 5;
const INITIAL_SPAWN_MARGIN_X = 28;
const PhysicsKinematicSyncSystem = createPhysicsKinematicSyncSystem();

function randomInitialX(width: number): number {
  const minX = INITIAL_SPAWN_MARGIN_X;
  const maxX = Math.max(minX + 1, width - INITIAL_SPAWN_MARGIN_X);
  return minX + Math.random() * (maxX - minX);
}

export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true,

  ui: [BackgroundUI, BulletUI, EnemyUI, PlayerUI, ScoreUI],

  // Collision gameplay is handled directly in prefab physics.onCollision callbacks.
  systems: [
    ViewportSystem,
    PlayerSystem,
    AiSystem,
    MovementSystem,
    PhysicsKinematicSyncSystem,
    SpawnerSystem,
  ],

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

    const renderer = api.services.get('renderer');
    const width = renderer.logicalWidth;

    api.prefabs.instantiate('Player');
    for (let i = 0; i < INITIAL_ENEMIES; i++) {
      api.prefabs.instantiate('Enemy', randomInitialX(width), -30 - i * 15);
    }
  },

  onExit(_api) {},
}));
