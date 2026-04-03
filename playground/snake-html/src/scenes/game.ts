import { defineScene } from '@gwenjs/core';
import { SnakeSystem } from '../systems/SnakeSystem';

export const GameScene = defineScene('Game', () => ({
  systems: [SnakeSystem],
}));
