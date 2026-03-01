/**
 * SceneManager tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneManager } from '../src/scene';
import type { Scene } from '../src/scene';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';
import type { EngineAPI } from '../src/index';

function makeAPI(): EngineAPI {
  return createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
}

function makeScene(name: string, overrides: Partial<Scene> = {}): Scene & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    onEnter: vi.fn(() => calls.push(`${name}:enter`)),
    onUpdate: vi.fn(() => calls.push(`${name}:update`)),
    onExit: vi.fn(() => calls.push(`${name}:exit`)),
    calls,
    ...overrides,
  };
}

describe('SceneManager', () => {
  let sm: SceneManager;
  let api: EngineAPI;

  beforeEach(() => {
    sm = new SceneManager();
    api = makeAPI();
    sm.onInit(api);
  });

  describe('register()', () => {
    it('should register a scene', () => {
      sm.register(makeScene('Menu'));
      expect(sm.hasScene('Menu')).toBe(true);
    });

    it('should support chaining', () => {
      const result = sm.register(makeScene('A')).register(makeScene('B'));
      expect(result).toBe(sm);
      expect(sm.hasScene('A')).toBe(true);
      expect(sm.hasScene('B')).toBe(true);
    });

    it('should start with no active scene', () => {
      expect(sm.getCurrentSceneName()).toBeNull();
      expect(sm.getCurrentScene()).toBeNull();
    });
  });

  describe('loadSceneImmediate()', () => {
    it('should call onEnter on load', () => {
      const menu = makeScene('Menu');
      sm.register(menu);
      sm.loadSceneImmediate('Menu', api);

      expect(menu.onEnter).toHaveBeenCalledWith(api);
      expect(sm.getCurrentSceneName()).toBe('Menu');
    });

    it('should call onExit then onEnter when transitioning', () => {
      const menu = makeScene('Menu');
      const game = makeScene('Game');
      sm.register(menu).register(game);

      sm.loadSceneImmediate('Menu', api);
      sm.loadSceneImmediate('Game', api);

      expect(menu.onExit).toHaveBeenCalled();
      expect(game.onEnter).toHaveBeenCalled();
      expect(sm.getCurrentSceneName()).toBe('Game');
    });

    it('should purge all entities between scenes', () => {
      const menu = makeScene('Menu', {
        onEnter: (api) => {
          api.createEntity();
          api.createEntity();
        },
        onExit: vi.fn(),
      });
      const game = makeScene('Game');

      sm.register(menu).register(game);
      sm.loadSceneImmediate('Menu', api);
      expect(api.query([])).toHaveLength(2);

      sm.loadSceneImmediate('Game', api);
      // Entities should be gone after transition
      expect(api.query([])).toHaveLength(0);
    });

    it('should throw for unknown scene', () => {
      expect(() => sm.loadSceneImmediate('Unknown', api)).toThrow("Unknown scene 'Unknown'");
    });
  });

  describe('loadScene() — deferred transition', () => {
    it('should apply transition at start of next frame', () => {
      const menu = makeScene('Menu');
      sm.register(menu);

      sm.loadScene('Menu'); // schedule
      expect(sm.getCurrentSceneName()).toBeNull(); // not yet

      sm.onBeforeUpdate(api, 0.016); // tick
      expect(sm.getCurrentSceneName()).toBe('Menu');
      expect(menu.onEnter).toHaveBeenCalled();
    });

    it('should throw for unknown scene name', () => {
      expect(() => sm.loadScene('Ghost')).toThrow("Unknown scene 'Ghost'");
    });
  });

  describe('onUpdate()', () => {
    it('should delegate onUpdate to current scene', () => {
      const game = makeScene('Game');
      sm.register(game);
      sm.loadSceneImmediate('Game', api);

      sm.onUpdate(api, 0.016);
      expect(game.onUpdate).toHaveBeenCalledWith(api, 0.016);
    });

    it('should not throw if no active scene', () => {
      expect(() => sm.onUpdate(api, 0.016)).not.toThrow();
    });
  });

  describe('onDestroy()', () => {
    it('should call onExit on active scene', () => {
      const menu = makeScene('Menu');
      sm.register(menu);
      sm.loadSceneImmediate('Menu', api);
      sm.onDestroy();

      expect(menu.onExit).toHaveBeenCalled();
      expect(sm.getCurrentScene()).toBeNull();
    });
  });

  describe('Full lifecycle', () => {
    it('should follow: onEnter → onUpdate → onExit → (new) onEnter', () => {
      const menu = makeScene('Menu');
      const game = makeScene('Game');
      sm.register(menu).register(game);

      sm.loadSceneImmediate('Menu', api);
      sm.onUpdate(api, 0.016);         // Menu:update
      sm.loadSceneImmediate('Game', api); // Menu:exit, Game:enter
      sm.onUpdate(api, 0.016);         // Game:update

      expect(menu.calls).toEqual(['Menu:enter', 'Menu:update', 'Menu:exit']);
      expect(game.calls).toEqual(['Game:enter', 'Game:update']);
    });
  });

  describe('Scene has name', () => {
    it('should have name "SceneManager"', () => {
      expect(sm.name).toBe('SceneManager');
    });
  });
});
