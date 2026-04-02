// packages/@gwenengine/kit-platformer/tests/advanced-mode.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPlayerPrefab } from '../src/prefabs/player.js';
import { PlatformerKitPlugin } from '../src/plugin.js';
import { Position } from '../src/components/StandardComponents.js';
import { defineComponent, Types } from '@gwenengine/core';

const CustomPosition = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32, z: Types.f32 },
});

const makeApi = (servicesMap = new Map()) => {
  const components = new Map<string, any>();
  return {
    createEntity: () => 1n as any,
    addComponent: vi.fn((_id: any, def: any, data: any) => {
      components.set(def.name || def, data);
    }),
    services: {
      has: (name: string) => servicesMap.has(name),
      get: (name: string) => servicesMap.get(name),
    },
    _components: components,
  };
};

/** Creates a minimal V2 mock engine for plugin setup. */
function createMockEngine() {
  const svc = new Map<string, unknown>();
  return {
    provide: (key: string, value: unknown) => {
      svc.set(key, value);
    },
    inject: (key: string) => {
      const v = svc.get(key);
      if (v === undefined) throw new Error(`No service: ${key}`);
      return v;
    },
    tryInject: (key: string) => svc.get(key),
    hooks: { hook: vi.fn(), callHook: vi.fn() },
  };
}

describe('Advanced Mode — Component Overrides', () => {
  it('uses default Position when no overrides provided', () => {
    const prefab = createPlayerPrefab();
    const api = makeApi();
    prefab.create(api as any, 10, 20);

    // Should have been called with the default Position object
    expect(api.addComponent).toHaveBeenCalledWith(1n, Position, { x: 10, y: 20 });
  });

  it('uses local override via factory options', () => {
    const prefab = createPlayerPrefab({
      components: { position: CustomPosition },
    });
    const api = makeApi();
    prefab.create(api as any, 10, 20);

    expect(api.addComponent).toHaveBeenCalledWith(1n, CustomPosition, { x: 10, y: 20 });
  });

  it('uses global override via PlatformerKitPlugin', () => {
    // Create plugin, set up with mock engine to register the service
    const plugin = PlatformerKitPlugin({ components: { position: CustomPosition } });
    const mockEngine = createMockEngine();
    plugin.setup(mockEngine as any);
    const platformerKitService = mockEngine.inject('platformer');

    const services = new Map();
    services.set('platformer', platformerKitService);

    const prefab = createPlayerPrefab();
    const api = makeApi(services);
    prefab.create(api as any, 10, 20);

    expect(api.addComponent).toHaveBeenCalledWith(1n, CustomPosition, { x: 10, y: 20 });
  });

  it('prefers local override over global override', () => {
    const GlobalPosition = defineComponent({ name: 'pos_global', schema: {} });
    const LocalPosition = defineComponent({ name: 'pos_local', schema: {} });

    const plugin = PlatformerKitPlugin({ components: { position: GlobalPosition as any } });
    const mockEngine = createMockEngine();
    plugin.setup(mockEngine as any);
    const platformerKitService = mockEngine.inject('platformer');

    const services = new Map();
    services.set('platformer', platformerKitService);

    const prefab = createPlayerPrefab({
      components: { position: LocalPosition as any },
    });
    const api = makeApi(services);
    prefab.create(api as any, 10, 20);

    expect(api.addComponent).toHaveBeenCalledWith(1n, LocalPosition, { x: 10, y: 20 });
  });
});
