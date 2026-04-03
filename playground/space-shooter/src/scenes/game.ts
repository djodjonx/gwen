import { defineScene } from '@gwenjs/core';
import { PlayerSystem } from '../systems/PlayerSystem';
import { EnemySystem } from '../systems/EnemySystem';
import { BulletSystem } from '../systems/BulletSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { RenderSystem } from '../systems/RenderSystem';

export const GameScene = defineScene('Game', () => ({
  systems: [PlayerSystem, EnemySystem, BulletSystem, CollisionSystem, RenderSystem],
}));
