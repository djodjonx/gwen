import { describe, it, expect, beforeEach } from 'vitest';
import { SceneManager, defineScene } from '../src/api/scene';
import { createEngineAPI } from '../src/api/api';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/core/ecs';
import { GlobalStringPoolManager } from '../src/utils/string-pool';
import type { EngineAPI } from '../src/types';

describe('SceneManager + StringPoolManager integration', () => {
  let sceneManager: SceneManager;
  let api: EngineAPI;

  beforeEach(() => {
    sceneManager = new SceneManager();
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
    sceneManager.onInit(api);

    // Clean pools
    GlobalStringPoolManager.scene.clear();
    GlobalStringPoolManager.persistent.clear();
  });

  it('should clear scene pool when purging entities', async () => {
    const Scene1 = defineScene({
      name: 'Scene1',
      systems: [],
      onEnter: () => {},
      onExit: () => {},
    });

    const Scene2 = defineScene({
      name: 'Scene2',
      systems: [],
      onEnter: () => {},
      onExit: () => {},
    });

    sceneManager.register(Scene1);
    sceneManager.register(Scene2);

    // Load first scene
    await sceneManager.loadSceneImmediate('Scene1', api);

    // Add some strings to scene pool
    GlobalStringPoolManager.scene.intern('entity-1');
    GlobalStringPoolManager.scene.intern('entity-2');
    expect(GlobalStringPoolManager.scene.size).toBe(2);

    // Transition to different scene - this triggers purgeEntities()
    await sceneManager.loadSceneImmediate('Scene2', api);

    // Scene pool should be cleared during transition
    expect(GlobalStringPoolManager.scene.size).toBe(0);
  });

  it('should NOT clear persistent pool during scene transition', async () => {
    // Define two scenes
    const Scene1 = defineScene({
      name: 'Scene1',
      systems: [],
      onEnter: () => {},
      onExit: () => {},
    });

    const Scene2 = defineScene({
      name: 'Scene2',
      systems: [],
      onEnter: () => {},
      onExit: () => {},
    });

    sceneManager.register(Scene1);
    sceneManager.register(Scene2);

    // Load first scene
    await sceneManager.loadSceneImmediate('Scene1', api);

    // Add strings to both pools after first load
    GlobalStringPoolManager.scene.intern('temp-data');
    GlobalStringPoolManager.persistent.intern('save-data');

    expect(GlobalStringPoolManager.scene.size).toBe(1);
    expect(GlobalStringPoolManager.persistent.size).toBe(1);

    // Transition to second scene - this triggers purgeEntities()
    await sceneManager.loadSceneImmediate('Scene2', api);
    expect(GlobalStringPoolManager.scene.size).toBe(0); // Cleared
    expect(GlobalStringPoolManager.persistent.size).toBe(1); // Preserved
  });

  it('should handle 50 scene transitions without leaking memory', async () => {
    const SceneA = defineScene({
      name: 'SceneA',
      systems: [],
      onEnter: (_api) => {
        // Simulate entities with string data
        for (let i = 0; i < 10; i++) {
          GlobalStringPoolManager.scene.intern(`entity-a-${i}`);
        }
      },
      onExit: () => {},
    });

    const SceneB = defineScene({
      name: 'SceneB',
      systems: [],
      onEnter: (_api) => {
        // Simulate entities with string data
        for (let i = 0; i < 10; i++) {
          GlobalStringPoolManager.scene.intern(`entity-b-${i}`);
        }
      },
      onExit: () => {},
    });

    sceneManager.register(SceneA);
    sceneManager.register(SceneB);

    // Simulate 50 transitions (25 back and forth)
    for (let i = 0; i < 25; i++) {
      await sceneManager.loadSceneImmediate('SceneA', api);
      await sceneManager.loadSceneImmediate('SceneB', api);
    }

    // After all transitions, scene pool should only contain SceneB's 10 strings
    // (not accumulated from all 50 transitions)
    expect(GlobalStringPoolManager.scene.size).toBeLessThanOrEqual(10);
  });

  it('should preserve persistent strings across multiple transitions', async () => {
    const playerName = 'Hero';
    const persistentId = GlobalStringPoolManager.persistent.intern(playerName);

    const TestScene = defineScene({
      name: 'Test',
      systems: [],
      onEnter: () => {},
      onExit: () => {},
    });

    sceneManager.register(TestScene);

    // Load scene 10 times (simulating restarts)
    for (let i = 0; i < 10; i++) {
      await sceneManager.loadSceneImmediate('Test', api);
    }

    // Persistent string should still be accessible
    expect(GlobalStringPoolManager.persistent.get(persistentId)).toBe(playerName);
    expect(GlobalStringPoolManager.persistent.size).toBe(1);
  });

  it('should clear scene pool even when scene has no entities', async () => {
    const SceneA = defineScene({
      name: 'SceneA',
      systems: [],
      onEnter: () => {},
      onExit: () => {},
    });

    const EmptyScene = defineScene({
      name: 'Empty',
      systems: [],
      onEnter: () => {},
      onExit: () => {},
    });

    sceneManager.register(SceneA);
    sceneManager.register(EmptyScene);

    // Load first scene
    await sceneManager.loadSceneImmediate('SceneA', api);

    // Manually add strings (simulate scene content)
    GlobalStringPoolManager.scene.intern('orphan-1');
    GlobalStringPoolManager.scene.intern('orphan-2');
    expect(GlobalStringPoolManager.scene.size).toBe(2);

    // Transition to empty scene - should trigger purge
    await sceneManager.loadSceneImmediate('Empty', api);

    // Pool should be cleared even if new scene creates no entities
    expect(GlobalStringPoolManager.scene.size).toBe(0);
  });
});
