import { defineScene, UIComponent } from '@gwen/engine-core';
import type { SceneManager } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import { BootUI } from '../ui/BootUI';

export const BootScene = defineScene('Boot', (scenes: SceneManager) => {
  let keyboard: KeyboardInput | null = null;

  return {
    ui: [BootUI],

    onEnter(api) {
      keyboard = api.services.get('keyboard');
      const id = api.createEntity();
      api.addComponent(id, UIComponent, { uiName: 'BootUI' });
    },

    onUpdate() {
      if (keyboard?.isJustPressed('Space') || keyboard?.isJustPressed('Enter')) {
        scenes.loadScene('Game');
      }
    },

    onExit() {},
  };
});
