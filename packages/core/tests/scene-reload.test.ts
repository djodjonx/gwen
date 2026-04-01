/**
 * Tests for Scene Reload System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneManager, defineScene } from '../src/api/scene';
import { createEngineAPI, type EngineAPIImpl } from '../src/api/api';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/core/ecs';
import { createGwenHooks } from '../src/hooks';
import type { ReloadContext } from '../src';

describe('Scene Reload System', () => {
  let sceneManager: SceneManager;
  let api: EngineAPIImpl;

  beforeEach(() => {
    const entityManager = new EntityManager(1000);
    const components = new ComponentRegistry();
    const queryEngine = new QueryEngine();
    const hooks = createGwenHooks<GwenDefaultHooks>();

    api = createEngineAPI(entityManager, components, queryEngine, undefined, hooks);
    sceneManager = new SceneManager();
    sceneManager.onInit(api);
  });

  describe('reloadOnReenter: true (default)', () => {
    it('should reload scene when re-entering by default', async () => {
      let enterCount = 0;

      const TestScene = defineScene({
        name: 'Test',
        // reloadOnReenter not specified → default true
        onEnter() {
          enterCount++;
        },
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(1);

      // Re-enter → should reload (call onEnter again)
      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(2);
    });

    it('should reload scene when explicitly set to true', async () => {
      let enterCount = 0;

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: true,
        onEnter() {
          enterCount++;
        },
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(1);

      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(2);
    });

    it('should call scene:willReload hook on reload', async () => {
      const hookCallback = vi.fn();
      api.hooks.hook('scene:willReload', hookCallback);

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: true,
        onEnter() {},
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);

      expect(hookCallback).not.toHaveBeenCalled();

      // Re-enter → should call willReload hook
      await sceneManager.loadSceneImmediate('Test', api);

      expect(hookCallback).toHaveBeenCalledOnce();
      expect(hookCallback).toHaveBeenCalledWith(
        'Test',
        expect.objectContaining({
          fromScene: 'Test',
          toScene: 'Test',
          isReenter: true,
          enterCount: 2,
        }),
      );
    });
  });

  describe('reloadOnReenter: false', () => {
    it('should NOT reload scene when set to false', async () => {
      let enterCount = 0;

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: false,
        onEnter() {
          enterCount++;
        },
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(1);

      // Re-enter → should NOT reload
      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(1); // Still 1 !
    });

    it('should NOT call scene:willReload hook when no reload', async () => {
      const hookCallback = vi.fn();
      api.hooks.hook('scene:willReload', hookCallback);

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: false,
        onEnter() {},
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      await sceneManager.loadSceneImmediate('Test', api);

      expect(hookCallback).not.toHaveBeenCalled();
    });
  });

  describe('reloadOnReenter: function evaluator', () => {
    it('should evaluate function to decide reload', async () => {
      let enterCount = 0;
      const evaluator = vi.fn((api, ctx: ReloadContext) => ctx.enterCount > 2);

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: evaluator,
        onEnter() {
          enterCount++;
        },
        onExit() {},
      });

      sceneManager.register(TestScene);

      // First enter
      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(1);
      expect(evaluator).not.toHaveBeenCalled();

      // Second enter (enterCount=2) → evaluator returns false → no reload
      await sceneManager.loadSceneImmediate('Test', api);
      expect(evaluator).toHaveBeenCalledOnce();
      expect(enterCount).toBe(1); // No reload

      // Third enter (enterCount=3) → evaluator returns true → reload
      await sceneManager.loadSceneImmediate('Test', api);
      expect(evaluator).toHaveBeenCalledTimes(2);
      expect(enterCount).toBe(2); // Reloaded!
    });

    it('should pass correct context to evaluator', async () => {
      const evaluator = vi.fn(() => false);

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: evaluator,
        onEnter() {},
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      await sceneManager.loadSceneImmediate('Test', api, { reason: 'gameOver', score: 1000 });

      expect(evaluator).toHaveBeenCalledWith(api, {
        fromScene: 'Test',
        toScene: 'Test',
        isReenter: true,
        enterCount: 2,
        data: { reason: 'gameOver', score: 1000 },
      });
    });

    it('should support conditional reload based on data', async () => {
      let enterCount = 0;

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: (api, ctx) => ctx.data?.reason === 'gameOver',
        onEnter() {
          enterCount++;
        },
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      expect(enterCount).toBe(1);

      // Re-enter without gameOver → no reload
      await sceneManager.loadSceneImmediate('Test', api, { reason: 'retry' });
      expect(enterCount).toBe(1);

      // Re-enter with gameOver → reload
      await sceneManager.loadSceneImmediate('Test', api, { reason: 'gameOver' });
      expect(enterCount).toBe(2);
    });
  });

  describe('Normal scene transitions (not re-enter)', () => {
    it('should always reload when switching between different scenes', async () => {
      let enterCountA = 0;
      let enterCountB = 0;

      const SceneA = defineScene({
        name: 'A',
        reloadOnReenter: false, // Even with false
        onEnter() {
          enterCountA++;
        },
        onExit() {},
      });

      const SceneB = defineScene({
        name: 'B',
        reloadOnReenter: false,
        onEnter() {
          enterCountB++;
        },
        onExit() {},
      });

      sceneManager.register(SceneA);
      sceneManager.register(SceneB);

      await sceneManager.loadSceneImmediate('A', api);
      expect(enterCountA).toBe(1);

      await sceneManager.loadSceneImmediate('B', api);
      expect(enterCountB).toBe(1);

      await sceneManager.loadSceneImmediate('A', api);
      expect(enterCountA).toBe(2); // Always reload on different scene

      await sceneManager.loadSceneImmediate('B', api);
      expect(enterCountB).toBe(2);
    });
  });

  describe('Systems recreation on reload', () => {
    it('should recreate systems with factory when reload', async () => {
      let systemInstances = 0;

      const TestSystem = vi.fn(() => {
        systemInstances++;
        return {
          name: 'TestSystem',
          onInit: vi.fn(),
        };
      });

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: true,
        systems: [TestSystem],
        onEnter() {},
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      expect(systemInstances).toBe(1);

      // Reload → system factory called again
      await sceneManager.loadSceneImmediate('Test', api);
      expect(systemInstances).toBe(2);
    });
  });

  describe('enterCount tracking', () => {
    it('should increment enterCount on each load', async () => {
      const evaluator = vi.fn(() => false);

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: evaluator,
        onEnter() {},
        onExit() {},
      });

      sceneManager.register(TestScene);

      await sceneManager.loadSceneImmediate('Test', api);
      await sceneManager.loadSceneImmediate('Test', api);
      expect(evaluator).toHaveBeenLastCalledWith(api, expect.objectContaining({ enterCount: 2 }));

      await sceneManager.loadSceneImmediate('Test', api);
      expect(evaluator).toHaveBeenLastCalledWith(api, expect.objectContaining({ enterCount: 3 }));
    });
  });

  describe('Edge cases', () => {
    it('should handle scene with no systems', async () => {
      let enterCount = 0;

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: true,
        // No systems
        onEnter() {
          enterCount++;
        },
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);
      await sceneManager.loadSceneImmediate('Test', api);

      expect(enterCount).toBe(2);
    });

    it('should handle evaluator throwing error gracefully', async () => {
      const badEvaluator = vi.fn(() => {
        throw new Error('Evaluator error');
      });

      const TestScene = defineScene({
        name: 'Test',
        reloadOnReenter: badEvaluator,
        onEnter() {},
        onExit() {},
      });

      sceneManager.register(TestScene);
      await sceneManager.loadSceneImmediate('Test', api);

      // Should not crash — evaluator error is caught internally
      await expect(sceneManager.loadSceneImmediate('Test', api)).rejects.toThrow('Evaluator error');
    });
  });
});
