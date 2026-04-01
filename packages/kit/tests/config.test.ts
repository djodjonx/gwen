import { describe, expect, it, expectTypeOf } from 'vitest';
import {
  defineConfig,
  type GwenPlugin,
  type MergePluginsPrefabExtensions,
  type MergePluginsSceneExtensions,
  type MergePluginsUIExtensions,
} from '../src';

const PluginA = {} as GwenPlugin<'A', { a: string }>;
const PluginB = {} as GwenPlugin<'B', { b: number }, { 'b:tick': (dt: number) => void }>;

// Plugins with extension schemas
const PhysicsPlugin = {
  name: 'physics' as const,
  extensions: {
    prefab: {} as { mass: number; isStatic: boolean },
    scene: {} as { gravity: number },
  },
} as GwenPlugin & {
  extensions: { prefab: { mass: number; isStatic: boolean }; scene: { gravity: number } };
};

const AudioPlugin = {
  name: 'audio' as const,
  extensions: {
    prefab: {} as { volume: number },
    ui: {} as { layer: string },
  },
} as GwenPlugin & { extensions: { prefab: { volume: number }; ui: { layer: string } } };

describe('@gwenengine/kit defineConfig', () => {
  it('keeps runtime payload unchanged', () => {
    const conf = defineConfig({
      engine: { maxEntities: 10_000 },
      plugins: [PluginA, PluginB],
      html: { title: 'Game', background: '#000000' },
    });

    expect(conf.engine?.maxEntities).toBe(10_000);
    expect((conf.plugins ?? []).length).toBe(2);
  });

  it('infers services from declared plugins', () => {
    const conf = defineConfig({ plugins: [PluginA, PluginB] });
    expectTypeOf(conf._services).toMatchTypeOf<{ a: string; b: number }>();
  });

  it('infers hooks from declared plugins', () => {
    const conf = defineConfig({ plugins: [PluginB] });
    expectTypeOf(conf._hooks).toHaveProperty('b:tick');
    expectTypeOf(conf._hooks).toHaveProperty('engine:tick');
  });
});

describe('@gwenengine/kit MergePlugins*Extensions', () => {
  it('MergePluginsPrefabExtensions merges prefab extensions from all plugins', () => {
    type Merged = MergePluginsPrefabExtensions<[typeof PhysicsPlugin, typeof AudioPlugin]>;
    const ext: Merged = { mass: 10, isStatic: false, volume: 0.8 };
    expect(ext.mass).toBe(10);
    expect(ext.volume).toBe(0.8);
  });

  it('MergePluginsSceneExtensions merges scene extensions from all plugins', () => {
    type Merged = MergePluginsSceneExtensions<[typeof PhysicsPlugin, typeof AudioPlugin]>;
    const ext: Merged = { gravity: -9.81 };
    expect(ext.gravity).toBe(-9.81);
  });

  it('MergePluginsUIExtensions merges UI extensions from all plugins', () => {
    type Merged = MergePluginsUIExtensions<[typeof PhysicsPlugin, typeof AudioPlugin]>;
    const ext: Merged = { layer: 'hud' };
    expect(ext.layer).toBe('hud');
  });

  it('plugin without extensions contributes empty (no pollution)', () => {
    type Merged = MergePluginsPrefabExtensions<[typeof PluginA]>;
    // Must compile — PluginA has no extensions
    const _ext: Merged = {} as Merged;
    expect(_ext).toBeDefined();
  });
});
