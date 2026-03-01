import { describe, it, expect, vi } from 'vitest';
import { Engine, SceneManager, type Scene, type TsPlugin } from '../src/index';

describe('SceneManager + Local Plugins', () => {
  it('should register and unregister scene local plugins on transition', () => {
    const engine = new Engine({ targetFPS: 60, maxEntities: 1000 });
    const scenes = new SceneManager();
    engine.registerSystem(scenes);

    const activePlugin: TsPlugin = {
      name: 'GameSystem',
      onInit: vi.fn(),
      onDestroy: vi.fn(),
    };

    const GameScene: Scene = {
      name: 'Game',
      plugins: [activePlugin],
      onEnter: vi.fn(),
      onExit: vi.fn(),
    };

    const MenuScene: Scene = {
      name: 'Menu',
      onEnter: vi.fn(),
      onExit: vi.fn(),
    };

    scenes.register(GameScene).register(MenuScene);

    // Initial state: plugin not loaded
    expect(engine.hasSystem('GameSystem')).toBe(false);

    // Enter Game scene
    scenes.loadSceneImmediate('Game', engine.getAPI());
    expect(engine.hasSystem('GameSystem')).toBe(true);
    expect(activePlugin.onInit).toHaveBeenCalled();

    // Leave Game scene -> Menu
    scenes.loadSceneImmediate('Menu', engine.getAPI());
    expect(engine.hasSystem('GameSystem')).toBe(false);
    expect(activePlugin.onDestroy).toHaveBeenCalled();
  });
});
