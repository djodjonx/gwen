/**
 * PluginManager tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../src/plugin-system/plugin-manager';
import type { GwenPlugin } from '../src/types';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/core/ecs';
import { createEngineAPI, type EngineAPIImpl } from '../src/api/api';
import { createGwenHooks } from '../src/hooks';

function makeAPI(): EngineAPIImpl {
  const hooks = createGwenHooks<GwenDefaultHooks>();
  return createEngineAPI(
    new EntityManager(100),
    new ComponentRegistry(),
    new QueryEngine(),
    undefined,
    hooks,
  );
}

function makePlugin(
  name: string,
  overrides: Partial<GwenPlugin> = {},
): GwenPlugin & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    name,
    onInit: vi.fn(() => calls.push('init')),
    onBeforeUpdate: vi.fn(() => calls.push('beforeUpdate')),
    onUpdate: vi.fn(() => calls.push('update')),
    onRender: vi.fn(() => calls.push('render')),
    onDestroy: vi.fn(() => calls.push('destroy')),
    calls,
    ...overrides,
  };
}

describe('PluginManager', () => {
  let pm: PluginManager;
  let api: ReturnType<typeof makeAPI>;

  beforeEach(() => {
    pm = new PluginManager();
    api = makeAPI();
  });

  // ── Registration ────────────────────────────────────────────────────────

  describe('register()', () => {
    it('should register plugin and call onInit', () => {
      const p = makePlugin('test');
      pm.register(p, api, api.hooks);
      expect(p.onInit).toHaveBeenCalled();
      expect(pm.has('test')).toBe(true);
    });

    it('should return true on success', () => {
      const p = makePlugin('p');
      expect(pm.register(p, api, api.hooks)).toBe(true);
    });

    it('should refuse duplicate registration', () => {
      const p = makePlugin('dup');
      pm.register(p, api, api.hooks);
      const result = pm.register(p, api, api.hooks);
      expect(result).toBe(false);
      expect(p.onInit).toHaveBeenCalledTimes(1);
    });

    it('should track count', () => {
      pm.register(makePlugin('a'), api, api.hooks);
      pm.register(makePlugin('b'), api, api.hooks);
      expect(pm.count()).toBe(2);
    });

    it('should list plugin names in order', () => {
      pm.register(makePlugin('first'), api, api.hooks);
      pm.register(makePlugin('second'), api, api.hooks);
      pm.register(makePlugin('third'), api, api.hooks);
      expect(pm.names()).toEqual(['first', 'second', 'third']);
    });
  });

  describe('registerAll()', () => {
    it('should register multiple plugins', () => {
      pm.registerAll([makePlugin('a'), makePlugin('b'), makePlugin('c')], api, api.hooks);
      expect(pm.count()).toBe(3);
    });
  });

  describe('get()', () => {
    it('should retrieve plugin by name', () => {
      const p = makePlugin('renderer');
      pm.register(p, api, api.hooks);
      expect(pm.get('renderer')).toBe(p);
    });

    it('should return undefined for unknown plugin', () => {
      expect(pm.get('missing')).toBeUndefined();
    });
  });

  describe('unregister()', () => {
    it('should remove plugin and call onDestroy', () => {
      const p = makePlugin('temp');
      pm.register(p, api, api.hooks);
      expect(pm.unregister('temp', api.hooks)).toBe(true);
      expect(pm.has('temp')).toBe(false);
      expect(p.onDestroy).toHaveBeenCalledOnce();
    });

    it('should return false for non-existent plugin', () => {
      expect(pm.unregister('ghost', api.hooks)).toBe(false);
    });

    it('should update count after unregister', () => {
      pm.register(makePlugin('a'), api, api.hooks);
      pm.register(makePlugin('b'), api, api.hooks);
      pm.unregister('a', api.hooks);
      expect(pm.count()).toBe(1);
    });
  });

  // ── Frame dispatch ──────────────────────────────────────────────────────

  describe('dispatchBeforeUpdate()', () => {
    it('should call onBeforeUpdate on all plugins', () => {
      const p1 = makePlugin('p1');
      const p2 = makePlugin('p2');
      pm.register(p1, api, api.hooks);
      pm.register(p2, api, api.hooks);
      pm.dispatchBeforeUpdate(api, 0.016, api.hooks);
      expect(p1.onBeforeUpdate).toHaveBeenCalledWith(api, 0.016);
      expect(p2.onBeforeUpdate).toHaveBeenCalledWith(api, 0.016);
    });

    it('should call in registration order', () => {
      const order: string[] = [];
      const p1 = makePlugin('first', { onBeforeUpdate: () => order.push('first') });
      const p2 = makePlugin('second', { onBeforeUpdate: () => order.push('second') });
      pm.register(p1, api, api.hooks);
      pm.register(p2, api, api.hooks);
      pm.dispatchBeforeUpdate(api, 0.016, api.hooks);
      expect(order).toEqual(['first', 'second']);
    });
  });

  describe('dispatchUpdate()', () => {
    it('should call onUpdate on all plugins', () => {
      const p = makePlugin('p');
      pm.register(p, api, api.hooks);
      pm.dispatchUpdate(api, 0.016, api.hooks);
      expect(p.onUpdate).toHaveBeenCalledWith(api, 0.016);
    });
  });

  describe('dispatchRender()', () => {
    it('should call onRender on all plugins', () => {
      const p = makePlugin('p');
      pm.register(p, api, api.hooks);
      pm.dispatchRender(api, api.hooks);
      expect(p.onRender).toHaveBeenCalledWith(api);
    });
  });

  describe('destroyAll()', () => {
    it('should call onDestroy in reverse order', () => {
      const order: string[] = [];
      pm.register(makePlugin('a', { onDestroy: () => order.push('a') }), api, api.hooks);
      pm.register(makePlugin('b', { onDestroy: () => order.push('b') }), api, api.hooks);
      pm.register(makePlugin('c', { onDestroy: () => order.push('c') }), api, api.hooks);
      pm.destroyAll(api.hooks);
      expect(order).toEqual(['c', 'b', 'a']);
    });

    it('should clear all plugins after destroy', () => {
      pm.register(makePlugin('x'), api, api.hooks);
      pm.destroyAll(api.hooks);
      expect(pm.count()).toBe(0);
    });
  });

  // ── Full lifecycle ──────────────────────────────────────────────────────

  describe('Full lifecycle order', () => {
    it('should follow onInit → onBeforeUpdate → onUpdate → onRender → onDestroy', () => {
      const p = makePlugin('lifecycle');
      pm.register(p, api, api.hooks); // → init
      pm.dispatchBeforeUpdate(api, 0.016, api.hooks); // → beforeUpdate
      pm.dispatchUpdate(api, 0.016, api.hooks); // → update
      pm.dispatchRender(api, api.hooks); // → render
      pm.destroyAll(api.hooks); // → destroy

      expect(p.calls).toEqual(['init', 'beforeUpdate', 'update', 'render', 'destroy']);
    });
  });

  // ── Optional lifecycle methods ──────────────────────────────────────────

  describe('Optional methods', () => {
    it('should not throw if plugin has no lifecycle methods', () => {
      const minimal: GwenPlugin = { name: 'minimal' };
      pm.register(minimal, api, api.hooks);
      expect(() => pm.dispatchBeforeUpdate(api, 0.016, api.hooks)).not.toThrow();
      expect(() => pm.dispatchUpdate(api, 0.016, api.hooks)).not.toThrow();
      expect(() => pm.dispatchRender(api, api.hooks)).not.toThrow();
      expect(() => pm.destroyAll(api.hooks)).not.toThrow();
    });
  });

  // ── DI integration ──────────────────────────────────────────────────────

  describe('Dependency injection between plugins', () => {
    it('should allow InputPlugin to expose state consumed by PlayerController', () => {
      interface IInputPlugin extends GwenPlugin {
        getState(): { keys: Record<string, boolean> };
      }

      const inputPlugin: IInputPlugin = {
        name: 'Input',
        getState: () => ({ keys: { ArrowRight: true } }),
        onInit: vi.fn(),
      };

      const playerPlugin: GwenPlugin = {
        name: 'PlayerController',
        onInit: (api) => {
          // Resolve Input in onInit (not onUpdate — per ENGINE.md rule)
          api.services.register('Input', inputPlugin);
          const input = api.services.get('Input') as IInputPlugin;
          expect(input.getState().keys['ArrowRight']).toBe(true);
        },
      };

      pm.register(inputPlugin, api, api.hooks);
      pm.register(playerPlugin, api, api.hooks);
    });
  });

  // ── P0-1 v2: Hook Tracking & Cleanup (Zombie Handler Fix) ──────────────

  describe('P0-1 v2: Automatic hook tracking', () => {
    /**
     * Test 1: Automatic lifecycle hooks should not accumulate after unregister
     *
     * Verifies that:
     * - hooks.hook() returns an unsubscriber that is captured
     * - unregister() calls the unsubscriber
     * - Handlers are not called after unregister
     */
    it('should not call onUpdate after unregister (Test 1)', async () => {
      const calls: number[] = [];
      const plugin: GwenPlugin = {
        name: 'TestPlugin',
        onUpdate: () => calls.push(1),
      };

      pm.register(plugin, api, api.hooks);
      await pm.dispatchUpdate(api, 0.016, api.hooks);
      expect(calls).toHaveLength(1);

      pm.unregister('TestPlugin', api.hooks);
      await pm.dispatchUpdate(api, 0.016, api.hooks);
      expect(calls).toHaveLength(1); // ← Still 1, not 2
    });

    /**
     * Test 2: Manual hooks registered in onInit should be tracked
     *
     * Verifies that:
     * - Plugins can call api.hooks.hook() directly in onInit
     * - The scoped API automatically tracks these registrations
     * - unregister() cleans up both auto and manual hooks
     */
    it('should track manual hooks registered in onInit (Test 2)', async () => {
      const calls: number[] = [];
      const plugin: GwenPlugin = {
        name: 'CustomHookPlugin',
        onInit(api) {
          // Register a custom hook manually
          api.hooks.hook('custom:event' as any, () => calls.push(1));
        },
      };

      pm.register(plugin, api, api.hooks);

      // Call the custom hook
      await api.hooks.callHook('custom:event' as any);
      expect(calls).toHaveLength(1);

      // Unregister the plugin
      pm.unregister('CustomHookPlugin', api.hooks);

      // The custom hook should no longer execute
      await api.hooks.callHook('custom:event' as any);
      expect(calls).toHaveLength(1); // ← Still 1, not 2
    });

    /**
     * Test 3: Multiple scene reloads should not accumulate handlers
     *
     * Verifies that repeated register/unregister cycles don't cause
     * exponential growth of handler invocations (the original bug symptom).
     */
    it('should not accumulate handlers across scene reloads (Test 3)', async () => {
      const calls: number[] = [];
      const makePlugin = (): GwenPlugin => ({
        name: 'ReloadablePlugin',
        onUpdate: () => calls.push(1),
      });

      // Simulate 5 scene reloads (register + unregister)
      for (let i = 0; i < 5; i++) {
        const plugin = makePlugin();
        pm.register(plugin, api, api.hooks);
        pm.unregister('ReloadablePlugin', api.hooks);
      }

      // Load the scene one more time
      pm.register(makePlugin(), api, api.hooks);
      await pm.dispatchUpdate(api, 0.016, api.hooks);

      // Should only be called once, not 5 times (exponential bug)
      expect(calls).toHaveLength(1);
    });

    /**
     * Test 4: destroyAll should clean all handlers
     *
     * Verifies that destroyAll() properly unsubscribes all hooks
     * from all plugins at once.
     */
    it('should clean all handlers on destroyAll (Test 4)', async () => {
      const calls: number[] = [];
      const plugins: GwenPlugin[] = [
        { name: 'P1', onUpdate: () => calls.push(1) },
        { name: 'P2', onUpdate: () => calls.push(2) },
      ];

      pm.registerAll(plugins, api, api.hooks);
      pm.destroyAll(api.hooks);

      await pm.dispatchUpdate(api, 0.016, api.hooks);
      expect(calls).toHaveLength(0); // ← No calls at all
    });

    /**
     * Test 5: WeakMap allows garbage collection of plugins
     *
     * Verifies that after unregister, plugins can be garbage collected
     * without lingering references in the unsubscriber map.
     *
     * Note: This is more of a memory hygiene test. We cannot directly
     * trigger GC in a portable way, but we can verify the API design
     * allows it by checking that the WeakMap doesn't prevent collection.
     */
    it('should allow garbage collection of plugin after unregister (Test 5)', () => {
      let plugin: GwenPlugin | null = {
        name: 'GCTestPlugin',
        onUpdate: () => {
          /* no-op */
        },
      };

      pm.register(plugin, api, api.hooks);
      pm.unregister('GCTestPlugin', api.hooks);

      // Plugin is now only held by this local variable
      // Setting to null allows GC (in a real GC scenario)
      plugin = null;

      // No crash, no reference errors — test is just that we get here
      expect(pm.count()).toBe(0);
    });

    /**
     * Test 6: scopedApi.hooks provides full API with wrapped hook()
     *
     * Verifies that the scoped hooks preserve all methods (callHook, etc.)
     * while only wrapping hook() for tracking.
     */
    it('should preserve full hooks API in scopedApi', async () => {
      let apiUsed: any = null;
      const plugin: GwenPlugin = {
        name: 'ScopedAPITest',
        onInit(api) {
          apiUsed = api;
        },
      };

      pm.register(plugin, api, api.hooks);

      // Check that all hooks methods are available
      expect(apiUsed.hooks.hook).toBeDefined();
      expect(apiUsed.hooks.callHook).toBeDefined();
      expect(apiUsed.hooks.removeHook).toBeDefined();
      expect(typeof apiUsed.hooks.hook).toBe('function');
      expect(typeof apiUsed.hooks.callHook).toBe('function');
      expect(typeof apiUsed.hooks.removeHook).toBe('function');
    });

    /**
     * Test 7: All lifecycle hooks are tracked
     *
     * Verifies that onBeforeUpdate, onUpdate, and onRender are all
     * properly tracked and cleaned up.
     */
    it('should track all lifecycle hooks (onBeforeUpdate, onUpdate, onRender)', async () => {
      const calls: string[] = [];
      const plugin: GwenPlugin = {
        name: 'AllLifecyclePlugin',
        onBeforeUpdate: () => calls.push('before'),
        onUpdate: () => calls.push('update'),
        onRender: () => calls.push('render'),
      };

      pm.register(plugin, api, api.hooks);

      // Dispatch all phases
      await pm.dispatchBeforeUpdate(api, 0.016, api.hooks);
      await pm.dispatchUpdate(api, 0.016, api.hooks);
      await pm.dispatchRender(api, api.hooks);

      expect(calls).toEqual(['before', 'update', 'render']);

      // Unregister
      pm.unregister('AllLifecyclePlugin', api.hooks);

      // Clear calls
      calls.length = 0;

      // Dispatch again
      await pm.dispatchBeforeUpdate(api, 0.016, api.hooks);
      await pm.dispatchUpdate(api, 0.016, api.hooks);
      await pm.dispatchRender(api, api.hooks);

      // Should not be called
      expect(calls).toHaveLength(0);
    });

    /**
     * Test 8: Combination of auto and manual hooks are all tracked
     *
     * Verifies that a plugin using both auto lifecycle hooks and
     * manual hooks registered in onInit gets everything cleaned up.
     */
    it('should track combination of auto and manual hooks', async () => {
      const calls: string[] = [];
      const plugin: GwenPlugin = {
        name: 'MixedHooksPlugin',
        onUpdate: () => calls.push('auto:update'),
        onInit(api) {
          // Register a custom hook
          api.hooks.hook('custom:hook' as any, () => calls.push('manual:custom'));
        },
      };

      pm.register(plugin, api, api.hooks);

      // Trigger both
      await pm.dispatchUpdate(api, 0.016, api.hooks);
      await api.hooks.callHook('custom:hook' as any);

      expect(calls).toEqual(['auto:update', 'manual:custom']);

      // Unregister
      pm.unregister('MixedHooksPlugin', api.hooks);
      calls.length = 0;

      // Both should be cleaned
      await pm.dispatchUpdate(api, 0.016, api.hooks);
      await api.hooks.callHook('custom:hook' as any);

      expect(calls).toHaveLength(0);
    });
  });
});

// ── createScopedApi ──────────────────────────────────────────────────────────

describe('PluginManager.createScopedApi()', () => {
  it('hooks registered via createScopedApi are tracked and cleaned up on unregister', async () => {
    const pm = new PluginManager();
    const api = makeAPI();
    const calls: string[] = [];

    const plugin = makePlugin('WasmPlugin');
    pm.register(plugin, api, api.hooks);

    // Simulate what createEngine() does for wasm.onInit:
    // create a scopedApi and register a hook via it
    const scopedApi = pm.createScopedApi(plugin, api, api.hooks);
    (scopedApi.hooks.hook as any)('prefab:instantiate', () => calls.push('wasm:prefab'));

    // Hook fires
    await (api.hooks.callHook as any)('prefab:instantiate', 1, {});
    expect(calls).toEqual(['wasm:prefab']);

    // Unregister cleans up the hook registered via createScopedApi
    pm.unregister('WasmPlugin', api.hooks);
    calls.length = 0;

    await (api.hooks.callHook as any)('prefab:instantiate', 1, {});
    expect(calls).toHaveLength(0); // cleaned up
  });

  it('createScopedApi returns an api with hooks overridden and other api fields preserved', () => {
    const pm = new PluginManager();
    const api = makeAPI();
    const plugin = makePlugin('TestPlugin');
    pm.register(plugin, api, api.hooks);

    const scopedApi = pm.createScopedApi(plugin, api, api.hooks);

    // hooks must be present and functional
    expect(typeof scopedApi.hooks.hook).toBe('function');
    expect(typeof scopedApi.hooks.callHook).toBe('function');
    expect(typeof scopedApi.hooks.removeHook).toBe('function');

    // scopedApi.hooks must be a different object from api.hooks (the scoped proxy)
    expect(scopedApi.hooks).not.toBe(api.hooks);

    // Other api properties must still be accessible
    expect(scopedApi.services).toBeDefined();
    expect(scopedApi.prefabs).toBeDefined();
  });
});
