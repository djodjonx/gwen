/**
 * PluginManager tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../src/plugin-system/plugin-manager';
import type { TsPlugin, EngineAPI } from '../src/types';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/core/ecs';
import { createEngineAPI } from '../src/api/api';

function makeAPI(): EngineAPI {
  return createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
}

function makePlugin(
  name: string,
  overrides: Partial<TsPlugin> = {},
): TsPlugin & {
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
  let api: EngineAPI;

  beforeEach(() => {
    pm = new PluginManager();
    api = makeAPI();
  });

  // ── Registration ────────────────────────────────────────────────────────

  describe('register()', () => {
    it('should register plugin and call onInit', () => {
      const p = makePlugin('test');
      pm.register(p, api);
      expect(p.onInit).toHaveBeenCalledWith(api);
      expect(pm.has('test')).toBe(true);
    });

    it('should return true on success', () => {
      const p = makePlugin('p');
      expect(pm.register(p, api)).toBe(true);
    });

    it('should refuse duplicate registration', () => {
      const p = makePlugin('dup');
      pm.register(p, api);
      const result = pm.register(p, api);
      expect(result).toBe(false);
      expect(p.onInit).toHaveBeenCalledTimes(1);
    });

    it('should track count', () => {
      pm.register(makePlugin('a'), api);
      pm.register(makePlugin('b'), api);
      expect(pm.count()).toBe(2);
    });

    it('should list plugin names in order', () => {
      pm.register(makePlugin('first'), api);
      pm.register(makePlugin('second'), api);
      pm.register(makePlugin('third'), api);
      expect(pm.names()).toEqual(['first', 'second', 'third']);
    });
  });

  describe('registerAll()', () => {
    it('should register multiple plugins', () => {
      pm.registerAll([makePlugin('a'), makePlugin('b'), makePlugin('c')], api);
      expect(pm.count()).toBe(3);
    });
  });

  describe('get()', () => {
    it('should retrieve plugin by name', () => {
      const p = makePlugin('renderer');
      pm.register(p, api);
      expect(pm.get('renderer')).toBe(p);
    });

    it('should return undefined for unknown plugin', () => {
      expect(pm.get('missing')).toBeUndefined();
    });
  });

  describe('unregister()', () => {
    it('should remove plugin and call onDestroy', () => {
      const p = makePlugin('temp');
      pm.register(p, api);
      expect(pm.unregister('temp')).toBe(true);
      expect(pm.has('temp')).toBe(false);
      expect(p.onDestroy).toHaveBeenCalledOnce();
    });

    it('should return false for non-existent plugin', () => {
      expect(pm.unregister('ghost')).toBe(false);
    });

    it('should update count after unregister', () => {
      pm.register(makePlugin('a'), api);
      pm.register(makePlugin('b'), api);
      pm.unregister('a');
      expect(pm.count()).toBe(1);
    });
  });

  // ── Frame dispatch ──────────────────────────────────────────────────────

  describe('dispatchBeforeUpdate()', () => {
    it('should call onBeforeUpdate on all plugins', () => {
      const p1 = makePlugin('p1');
      const p2 = makePlugin('p2');
      pm.register(p1, api);
      pm.register(p2, api);
      pm.dispatchBeforeUpdate(api, 0.016);
      expect(p1.onBeforeUpdate).toHaveBeenCalledWith(api, 0.016);
      expect(p2.onBeforeUpdate).toHaveBeenCalledWith(api, 0.016);
    });

    it('should call in registration order', () => {
      const order: string[] = [];
      const p1 = makePlugin('first', { onBeforeUpdate: () => order.push('first') });
      const p2 = makePlugin('second', { onBeforeUpdate: () => order.push('second') });
      pm.register(p1, api);
      pm.register(p2, api);
      pm.dispatchBeforeUpdate(api, 0.016);
      expect(order).toEqual(['first', 'second']);
    });
  });

  describe('dispatchUpdate()', () => {
    it('should call onUpdate on all plugins', () => {
      const p = makePlugin('p');
      pm.register(p, api);
      pm.dispatchUpdate(api, 0.016);
      expect(p.onUpdate).toHaveBeenCalledWith(api, 0.016);
    });
  });

  describe('dispatchRender()', () => {
    it('should call onRender on all plugins', () => {
      const p = makePlugin('p');
      pm.register(p, api);
      pm.dispatchRender(api);
      expect(p.onRender).toHaveBeenCalledWith(api);
    });
  });

  describe('destroyAll()', () => {
    it('should call onDestroy in reverse order', () => {
      const order: string[] = [];
      pm.register(makePlugin('a', { onDestroy: () => order.push('a') }), api);
      pm.register(makePlugin('b', { onDestroy: () => order.push('b') }), api);
      pm.register(makePlugin('c', { onDestroy: () => order.push('c') }), api);
      pm.destroyAll();
      expect(order).toEqual(['c', 'b', 'a']);
    });

    it('should clear all plugins after destroy', () => {
      pm.register(makePlugin('x'), api);
      pm.destroyAll();
      expect(pm.count()).toBe(0);
    });
  });

  // ── Full lifecycle ──────────────────────────────────────────────────────

  describe('Full lifecycle order', () => {
    it('should follow onInit → onBeforeUpdate → onUpdate → onRender → onDestroy', () => {
      const p = makePlugin('lifecycle');
      pm.register(p, api); // → init
      pm.dispatchBeforeUpdate(api, 0.016); // → beforeUpdate
      pm.dispatchUpdate(api, 0.016); // → update
      pm.dispatchRender(api); // → render
      pm.destroyAll(); // → destroy

      expect(p.calls).toEqual(['init', 'beforeUpdate', 'update', 'render', 'destroy']);
    });
  });

  // ── Optional lifecycle methods ──────────────────────────────────────────

  describe('Optional methods', () => {
    it('should not throw if plugin has no lifecycle methods', () => {
      const minimal: TsPlugin = { name: 'minimal' };
      pm.register(minimal, api);
      expect(() => pm.dispatchBeforeUpdate(api, 0.016)).not.toThrow();
      expect(() => pm.dispatchUpdate(api, 0.016)).not.toThrow();
      expect(() => pm.dispatchRender(api)).not.toThrow();
      expect(() => pm.destroyAll()).not.toThrow();
    });
  });

  // ── DI integration ──────────────────────────────────────────────────────

  describe('Dependency injection between plugins', () => {
    it('should allow InputPlugin to expose state consumed by PlayerController', () => {
      interface IInputPlugin extends TsPlugin {
        getState(): { keys: Record<string, boolean> };
      }

      const inputPlugin: IInputPlugin = {
        name: 'Input',
        getState: () => ({ keys: { ArrowRight: true } }),
        onInit: vi.fn(),
      };

      const playerPlugin: TsPlugin = {
        name: 'PlayerController',
        onInit: (api) => {
          // Resolve Input in onInit (not onUpdate — per ENGINE.md rule)
          api.services.register('Input', inputPlugin);
          const input = api.services.get<IInputPlugin>('Input');
          expect(input.getState().keys['ArrowRight']).toBe(true);
        },
      };

      pm.register(inputPlugin, api);
      pm.register(playerPlugin, api);
    });
  });
});
