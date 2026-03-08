import { defineScene, UIComponent } from '@gwen/engine-core';
import { SnakeSystem } from '../systems/SnakeSystem';
import { SnakeUI } from '../ui/SnakeUI';

export const MainScene = defineScene('Main', () => ({
  reloadOnReenter: true,
  systems: [SnakeSystem],
  ui: [SnakeUI],

  onEnter(api) {
    const uiId = api.createEntity();
    api.addComponent(uiId, UIComponent, { uiName: 'SnakeUI' });
  },

  onExit() {},
}));
