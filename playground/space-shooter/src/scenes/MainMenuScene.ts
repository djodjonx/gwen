import { defineScene, UIComponent } from '@gwenengine/core';
import type { SceneManager } from '@gwenengine/core';
import type { KeyboardInput } from '@gwenengine/input';
import { MainMenuUI } from '../ui/MainMenuUI';

export const MainMenuScene = defineScene('MainMenu', (scenes: SceneManager) => {
  let keyboard: KeyboardInput | null = null;

  return {
    ui: [MainMenuUI],

    onEnter(api) {
      keyboard = api.services.get('keyboard');
      const id = api.createEntity();
      api.addComponent(id, UIComponent, { uiName: 'MainMenuUI' });
    },

    onUpdate(_api, _dt) {
      if (keyboard?.isJustPressed('Space')) scenes.loadScene('Game');
    },

    onExit(_api) {},
  };
});
