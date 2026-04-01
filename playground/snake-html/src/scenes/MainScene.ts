import { defineScene, UIComponent } from '@gwenengine/core';
import { SnakeSystem } from '../systems/SnakeSystem';
import { SnakeUI } from '../ui/SnakeUI';

export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true,
  systems: [SnakeSystem],
  ui: [SnakeUI],

  onEnter(api) {
    const uiId = api.createEntity();
    api.addComponent(uiId, UIComponent, { uiName: 'SnakeUI' });
  },

  onExit() {},
}));
