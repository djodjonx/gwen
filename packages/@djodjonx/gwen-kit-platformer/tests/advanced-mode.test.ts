// packages/@djodjonx/gwen-kit-platformer/tests/advanced-mode.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPlayerPrefab } from '../src/prefabs/player.js';
import { PlatformerKitPlugin } from '../src/plugin.js';
import { Position } from '../src/components/StandardComponents.js';
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

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
    const plugin = new PlatformerKitPlugin({
      components: { position: CustomPosition },
    });
    const services = new Map();
    services.set('platformerKit', plugin.provides?.platformerKit);

    const prefab = createPlayerPrefab();
    const api = makeApi(services);
    prefab.create(api as any, 10, 20);

    expect(api.addComponent).toHaveBeenCalledWith(1n, CustomPosition, { x: 10, y: 20 });
  });

  it('prefers local override over global override', () => {
    const GlobalPosition = defineComponent({ name: 'pos_global', schema: {} });
    const LocalPosition = defineComponent({ name: 'pos_local', schema: {} });

    const plugin = new PlatformerKitPlugin({
      components: { position: GlobalPosition as any },
    });
    const services = new Map();
    services.set('platformerKit', plugin.provides?.platformerKit);

    const prefab = createPlayerPrefab({
      components: { position: LocalPosition as any },
    });
    const api = makeApi(services);
    prefab.create(api as any, 10, 20);

    expect(api.addComponent).toHaveBeenCalledWith(1n, LocalPosition, { x: 10, y: 20 });
  });
});
