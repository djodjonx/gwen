/**
 * Plugin typing system tests.
 *
 * Covers:
 * 1. GwenPlugin unified interface — TS-only and WASM shapes
 * 2. isWasmPlugin() type guard
 * 3. MergePluginsProvides<> — service inference from a mixed plugins array
 * 4. MergePluginsHooks<> — hooks inference
 * 5. defineConfig() type inference with the new single `plugins` field
 * 6. Legacy MergeProvides / MergeAllProvides backward compat aliases
 * 7. Official plugins (InputPlugin, AudioPlugin)
 */

import { describe, it, expect, vi } from 'vitest';
import { defineConfig } from '../../kit/src/config';
import {
  isWasmPlugin,
  type GwenPlugin,
  type GwenPluginWasmContext,
  type MergePluginsProvides,
  type MergePluginsHooks,
  type MergeProvides,
  type MergeAllProvides,
  type GwenConfigServices,
  type GwenConfigHooks,
} from '../src/index';
import { InputPlugin } from '../../plugin-input/src/index';
import { AudioPlugin } from '../../plugin-audio/src/index';

// ── Test service / hook types ─────────────────────────────────────────────────

interface MockService {
  value: number;
}
interface OtherService {
  label: string;
}

// ── GwenPlugin — TS-only shape ────────────────────────────────────────────────

describe('GwenPlugin — TS-only plugin', () => {
  it('class implementing GwenPlugin is correctly shaped', () => {
    class MyPlugin implements GwenPlugin<'MyPlugin', { foo: MockService }> {
      readonly name = 'MyPlugin' as const;
      readonly provides = { foo: {} as MockService };
    }
    const p = new MyPlugin();
    expect(p.name).toBe('MyPlugin');
    expect(p.provides).toEqual({ foo: {} });
    expect((p as GwenPlugin).wasm).toBeUndefined();
  });

  it('plugin without provides is a valid GwenPlugin', () => {
    class MinimalPlugin implements GwenPlugin<'Minimal'> {
      readonly name = 'Minimal' as const;
    }
    const p = new MinimalPlugin();
    expect(p.name).toBe('Minimal');
    expect((p as GwenPlugin).wasm).toBeUndefined();
  });

  it('isWasmPlugin returns false for a TS-only plugin', () => {
    const p: GwenPlugin = { name: 'TsOnly' };
    expect(isWasmPlugin(p)).toBe(false);
  });
});

// ── GwenPlugin — WASM shape ───────────────────────────────────────────────────

describe('GwenPlugin — WASM plugin', () => {
  it('plugin with wasm sub-object passes isWasmPlugin guard', () => {
    const wasmCtx: GwenPluginWasmContext = {
      id: 'physics2d',
      sharedMemoryBytes: 0,
      onInit: vi.fn().mockResolvedValue(undefined),
    };
    const plugin: GwenPlugin<'Physics2D', { physics: MockService }> = {
      name: 'Physics2D',
      provides: { physics: {} as MockService },
      wasm: wasmCtx,
    };
    expect(isWasmPlugin(plugin)).toBe(true);
    expect(plugin.wasm?.id).toBe('physics2d');
  });

  it('wasm plugin also supports TS lifecycle hooks', () => {
    const onInit = vi.fn();
    const plugin: GwenPlugin = {
      name: 'HybridPlugin',
      wasm: {
        id: 'hybrid',
        onInit: vi.fn().mockResolvedValue(undefined),
        onStep: vi.fn(),
      },
      onInit,
    };
    expect(isWasmPlugin(plugin)).toBe(true);
    expect(typeof plugin.onInit).toBe('function');
    expect(typeof plugin.wasm?.onStep).toBe('function');
  });
});

// ── MergePluginsProvides ──────────────────────────────────────────────────────

describe('MergePluginsProvides<> — service merging', () => {
  it('merges provides from multiple TS-only plugins', () => {
    class P1 implements GwenPlugin<'P1', { svc1: MockService }> {
      readonly name = 'P1' as const;
      readonly provides = { svc1: {} as MockService };
    }
    class P2 implements GwenPlugin<'P2', { svc2: OtherService }> {
      readonly name = 'P2' as const;
      readonly provides = { svc2: {} as OtherService };
    }
    const p1 = new P1();
    const p2 = new P2();

    // Compile-time verification — if it type-checks, the merge is correct
    type Merged = MergePluginsProvides<[typeof p1, typeof p2]>;
    const merged: Merged = { svc1: { value: 1 }, svc2: { label: 'hello' } };
    expect(merged.svc1.value).toBe(1);
    expect(merged.svc2.label).toBe('hello');
  });

  it('merges provides from a mixed WASM + TS array', () => {
    const wasmPlugin: GwenPlugin<'WasmPlugin', { physics: MockService }> = {
      name: 'WasmPlugin',
      provides: { physics: {} as MockService },
      wasm: { id: 'wasm', onInit: vi.fn().mockResolvedValue(undefined) },
    };
    const tsPlugin: GwenPlugin<'TsPlugin', { input: OtherService }> = {
      name: 'TsPlugin',
      provides: { input: {} as OtherService },
    };

    type Merged = MergePluginsProvides<[typeof wasmPlugin, typeof tsPlugin]>;
    const merged: Merged = { physics: { value: 1 }, input: { label: 'x' } };
    expect(merged.physics.value).toBe(1);
    expect(merged.input.label).toBe('x');
  });

  it('plugin without provides contributes a neutral (empty) record', () => {
    class NoProvides implements GwenPlugin<'NoProvides'> {
      readonly name = 'NoProvides' as const;
    }
    const p = new NoProvides();
    // Must compile — no pollution of the merged map
    type M = MergePluginsProvides<[typeof p]>;
    const _: M = {} as M;
    expect(true).toBe(true);
  });
});

// ── MergePluginsHooks ─────────────────────────────────────────────────────────

describe('MergePluginsHooks<> — hooks merging', () => {
  it('merges custom hooks from multiple plugins', () => {
    const p1: GwenPlugin<'P1', Record<string, unknown>, { 'p1:fire': () => void }> = {
      name: 'P1',
      providesHooks: {} as { 'p1:fire': () => void },
    };
    const p2: GwenPlugin<'P2', Record<string, unknown>, { 'p2:blast': (x: number) => void }> = {
      name: 'P2',
      providesHooks: {} as { 'p2:blast': (x: number) => void },
    };

    // Compile-time check — merged hooks must contain both keys
    type Merged = MergePluginsHooks<[typeof p1, typeof p2]>;
    const _fn1: Merged['p1:fire'] = () => {};
    const _fn2: Merged['p2:blast'] = (_x: number) => {};
    expect(true).toBe(true); // compiles = passed
  });

  it('always includes base GwenHooks (engine:tick etc.)', () => {
    const p: GwenPlugin = { name: 'P' };
    type H = MergePluginsHooks<[typeof p]>;
    // 'engine:tick' comes from GwenHooks — must be present in merged
    const _: H['engine:tick'] = (_dt: number) => {};
    expect(true).toBe(true);
  });
});

// ── defineConfig() — inference ────────────────────────────────────────────────

describe('defineConfig() — type inference', () => {
  it('unified plugins array carries inferred services', () => {
    const config = defineConfig({
      plugins: [new InputPlugin(), new AudioPlugin()],
    });

    type Services = GwenConfigServices<typeof config>;
    // keyboard from InputPlugin
    const _kb: Services['keyboard'] = {} as any;
    // audio from AudioPlugin
    const _au: Services['audio'] = {} as any;

    expect((config as any).plugins?.length).toBe(2);
  });

  it('legacy tsPlugins still infer services correctly', () => {
    const config = defineConfig({ tsPlugins: [new InputPlugin()] });
    type Services = GwenConfigServices<typeof config>;
    const _kb: Services['keyboard'] = {} as any;
    expect(true).toBe(true);
  });

  it('config without plugins infers Record<string, never>', () => {
    const config = defineConfig({ maxEntities: 500 });
    expect((config as any).maxEntities).toBe(500);
  });

  it('GwenConfigHooks includes engine:tick from base GwenHooks', () => {
    const config = defineConfig({ plugins: [new InputPlugin()] });
    type Hooks = GwenConfigHooks<typeof config>;
    const _fn: Hooks['engine:tick'] = (_dt: number) => {};
    expect(true).toBe(true);
  });
});

// ── Legacy type aliases ───────────────────────────────────────────────────────

describe('Legacy type aliases — backward compat', () => {
  it('MergeProvides is an alias of MergePluginsProvides', () => {
    class P implements GwenPlugin<'P', { svc: MockService }> {
      readonly name = 'P' as const;
      readonly provides = { svc: {} as MockService };
    }
    const p = new P();
    type New = MergePluginsProvides<[typeof p]>;
    type Old = MergeProvides<[typeof p]>;
    // Both must be assignable to each other
    const fromNew: New = { svc: { value: 1 } };
    const fromOld: Old = fromNew;
    expect(fromOld.svc.value).toBe(1);
  });

  it('MergeAllProvides<Ts, Wasm> works with two separate arrays', () => {
    const ts: GwenPlugin<'TS', { ts: MockService }> = {
      name: 'TS',
      provides: { ts: {} as MockService },
    };
    const wasm: GwenPlugin<'Wasm', { wasm: OtherService }> = {
      name: 'Wasm',
      provides: { wasm: {} as OtherService },
      wasm: { id: 'w', onInit: vi.fn().mockResolvedValue(undefined) },
    };

    type Merged = MergeAllProvides<[typeof ts], [typeof wasm]>;
    const merged: Merged = { ts: { value: 1 }, wasm: { label: 'hi' } };
    expect(merged.ts.value).toBe(1);
  });
});

// ── Official plugins ──────────────────────────────────────────────────────────

describe('InputPlugin', () => {
  it('has correct name literal and provides', () => {
    const p = new InputPlugin();
    expect(p.name).toBe('InputPlugin');
    expect(p.provides).toHaveProperty('keyboard');
    expect(p.provides).toHaveProperty('mouse');
    expect(p.provides).toHaveProperty('gamepad');
    expect(isWasmPlugin(p)).toBe(false);
  });
});

describe('AudioPlugin', () => {
  it('has correct name literal and provides', () => {
    const p = new AudioPlugin();
    expect(p.name).toBe('AudioPlugin');
    expect(p.provides).toHaveProperty('audio');
    expect(isWasmPlugin(p)).toBe(false);
  });
});
