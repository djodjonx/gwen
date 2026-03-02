import type { Scene, EngineAPI, SceneManager } from '@gwen/engine-core';
import { UIComponent } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import { MainMenuUI } from '../ui/MainMenuUI';

export class MainMenuScene implements Scene {
  readonly name = 'MainMenu';

  readonly ui = [MainMenuUI];

  private keyboard!: KeyboardInput;

  constructor(private scenes: SceneManager) {}

  onEnter(api: EngineAPI<GwenServices>) {
    this.keyboard = api.services.get('keyboard');

    // Entité porteuse du MainMenuUI
    const id = api.createEntity();
    api.addComponent(id, UIComponent, { uiName: 'MainMenuUI' });
  }

  onUpdate(_api: EngineAPI<GwenServices>, _dt: number) {
    if (this.keyboard?.isJustPressed('Space')) this.scenes.loadScene('Game');
  }

  onExit() {}
}
