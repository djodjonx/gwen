import { defineScene, UIComponent } from '@gwen/engine-core';
import type { EngineAPI, SceneManager } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import { MainMenuUI } from '../ui/MainMenuUI';

export const MainMenuScene = defineScene('MainMenu', (scenes: SceneManager) => {
  let keyboard: KeyboardInput | null = null;

  return {
    ui: [MainMenuUI],

    onEnter(api: EngineAPI<GwenServices>) {
      keyboard = api.services.get('keyboard');
      const id = api.createEntity();
      api.addComponent(id, UIComponent, { uiName: 'MainMenuUI' });
    },

    onUpdate(_api: EngineAPI<GwenServices>, _dt: number) {
      if (keyboard?.isJustPressed('Space')) scenes.loadScene('Game');
    },

    onExit(_api: EngineAPI<GwenServices>) {},
  };
});
