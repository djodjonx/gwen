/**
 * Configuration System Tests
 *
 * Covers:
 * - defaultConfig values
 * - defineConfig() — new `plugins` array + legacy `tsPlugins`/`wasmPlugins`
 * - mergeConfigs()
 * - ConfigBuilder — addPlugin() + deprecated addWasmPlugin / addTsPlugin
 */

import { describe, it, expect, vi } from 'vitest';
import { defineConfig } from '../../kit/src/config';
import type { EngineConfig, GwenPlugin, GwenPluginWasmContext } from '../src/types';
import { ConfigBuilder, defaultConfig, mergeConfigs } from '../src/config/config';
import { isWasmPlugin } from '../src/plugin-system/plugin-utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal WASM plugin stub using the new unified `GwenPlugin` shape.
 * The `wasm` sub-object is what identifies it as a WASM plugin at runtime.
 */
function mockWasmPlugin(id: string, name: string): GwenPlugin {
  const wasm: GwenPluginWasmContext = {
    id,
    sharedMemoryBytes: 0,
    onInit: vi.fn().mockResolvedValue(undefined),
  };
  return { name, wasm } satisfies GwenPlugin;
}

/** Build a minimal TS-only plugin stub (no `wasm` field). */
function mockTsPlugin(name: string): GwenPlugin {
  return { name } satisfies GwenPlugin;
}

// ── defaultConfig ─────────────────────────────────────────────────────────────

describe('defaultConfig', () => {
  it('has sensible scalar defaults', () => {
    expect(defaultConfig.maxEntities).toBe(5000);
    expect(defaultConfig.targetFPS).toBe(60);
    expect(defaultConfig.debug).toBe(false);
    expect(defaultConfig.enableStats).toBe(true);
  });

  it('has an empty unified plugins array', () => {
    expect(Array.isArray(defaultConfig.plugins)).toBe(true);
    expect(defaultConfig.plugins?.length).toBe(0);
  });

  it('does not carry rendering-specific fields', () => {
    expect((defaultConfig as any).canvas).toBeUndefined();
    expect((defaultConfig as any).width).toBeUndefined();
    expect((defaultConfig as any).height).toBeUndefined();
  });
});

// ── defineConfig ──────────────────────────────────────────────────────────────

describe('defineConfig()', () => {
  it('passes scalar fields through unchanged', () => {
    const config = defineConfig({ engine: { maxEntities: 10_000, targetFPS: 120 } });
    expect(config.engine?.maxEntities).toBe(10_000);
    expect(config.engine?.targetFPS).toBe(120);
  });

  it('accepts the unified plugins array (TS-only and WASM mixed)', () => {
    const wasm = mockWasmPlugin('physics', 'Physics2D');
    const ts = mockTsPlugin('input');

    const config = defineConfig({ plugins: [wasm, ts] });

    expect((config as any).plugins?.length).toBe(2);
  });

  it('accepts legacy tsPlugins for backward compatibility', () => {
    const config = defineConfig({ tsPlugins: [mockTsPlugin('input')] });
    expect((config as any).tsPlugins?.length).toBe(1);
  });

  it('accepts legacy wasmPlugins for backward compatibility', () => {
    const wasm = mockWasmPlugin('physics', 'Physics2D');
    const config = defineConfig({ wasmPlugins: [wasm] });
    expect((config as any).wasmPlugins?.length).toBe(1);
  });

  it('passes html config through', () => {
    const config = defineConfig({ html: { title: 'My Game', background: '#111' } });
    expect((config as any).html?.title).toBe('My Game');
  });
});

// ── mergeConfigs ──────────────────────────────────────────────────────────────

describe('mergeConfigs()', () => {
  it('prefers user scalar values over defaults', () => {
    const merged = mergeConfigs(defaultConfig, { maxEntities: 10_000, targetFPS: 120 });
    expect(merged.maxEntities).toBe(10_000);
    expect(merged.targetFPS).toBe(120);
  });

  it('keeps default values for unspecified fields', () => {
    const merged = mergeConfigs(defaultConfig, {});
    expect(merged.targetFPS).toBe(defaultConfig.targetFPS);
    expect(merged.maxEntities).toBe(defaultConfig.maxEntities);
  });

  it('concatenates plugins arrays (default first, user second)', () => {
    const base: EngineConfig = { ...defaultConfig, plugins: [mockTsPlugin('base')] };
    const user: Partial<EngineConfig> = { plugins: [mockTsPlugin('user')] };
    const merged = mergeConfigs(base, user);

    expect(merged.plugins?.length).toBe(2);
    expect(merged.plugins?.[0].name).toBe('base');
    expect(merged.plugins?.[1].name).toBe('user');
  });

  it('concatenates legacy wasmPlugins for backward compat', () => {
    const base: EngineConfig = {
      ...defaultConfig,
      wasmPlugins: [mockWasmPlugin('physics', 'Physics')],
    };
    const user: Partial<EngineConfig> = { wasmPlugins: [mockWasmPlugin('ai', 'AIEngine')] };
    const merged = mergeConfigs(base, user);

    expect(merged.wasmPlugins?.length).toBe(2);
  });
});

// ── isWasmPlugin ──────────────────────────────────────────────────────────────

describe('isWasmPlugin() type guard', () => {
  it('returns true for a plugin with a valid wasm sub-object', () => {
    const plugin = mockWasmPlugin('physics', 'Physics2D');
    expect(isWasmPlugin(plugin)).toBe(true);
  });

  it('returns false for a TS-only plugin (no wasm field)', () => {
    const plugin = mockTsPlugin('input');
    expect(isWasmPlugin(plugin)).toBe(false);
  });

  it('returns false when wasm.id is missing', () => {
    const plugin: GwenPlugin = {
      name: 'BadWasm',
      wasm: { id: '', onInit: vi.fn() } as any,
    };
    // id is empty string → falsy → guard returns false
    expect(isWasmPlugin(plugin)).toBe(false);
  });

  it('returns false when wasm.onInit is not a function', () => {
    const plugin: GwenPlugin = {
      name: 'BadWasm',
      wasm: { id: 'ok', onInit: 'not-a-fn' } as any,
    };
    expect(isWasmPlugin(plugin)).toBe(false);
  });

  it('correctly filters a mixed plugins array', () => {
    const wasm1 = mockWasmPlugin('physics', 'Physics2D');
    const wasm2 = mockWasmPlugin('ai', 'AIEngine');
    const ts1 = mockTsPlugin('input');
    const ts2 = mockTsPlugin('audio');
    const all = [wasm1, ts1, wasm2, ts2];

    const wasmList = all.filter(isWasmPlugin);
    const tsList = all.filter((p) => !isWasmPlugin(p));

    expect(wasmList.length).toBe(2);
    expect(tsList.length).toBe(2);
    expect(wasmList.every((p) => p.wasm !== undefined)).toBe(true);
    expect(tsList.every((p) => p.wasm === undefined)).toBe(true);
  });
});

// ── ConfigBuilder ─────────────────────────────────────────────────────────────

describe('ConfigBuilder', () => {
  it('is instantiable', () => {
    expect(new ConfigBuilder()).toBeDefined();
  });

  it('setMaxEntities / setTargetFPS', () => {
    const config = new ConfigBuilder().setMaxEntities(10_000).setTargetFPS(120).build();
    expect(config.maxEntities).toBe(10_000);
    expect(config.targetFPS).toBe(120);
  });

  it('enableDebug / disableDebug', () => {
    expect(new ConfigBuilder().enableDebug().build().debug).toBe(true);
    expect(new ConfigBuilder().disableDebug().build().debug).toBe(false);
  });

  it('enableStats / disableStats', () => {
    expect(new ConfigBuilder().enableStats().build().enableStats).toBe(true);
    expect(new ConfigBuilder().disableStats().build().enableStats).toBe(false);
  });

  it('addPlugin() puts plugins in the unified plugins array', () => {
    const wasm = mockWasmPlugin('physics', 'Physics2D');
    const ts = mockTsPlugin('input');

    const config = new ConfigBuilder().addPlugin(wasm).addPlugin(ts).build();

    expect(config.plugins?.length).toBe(2);
    expect(config.plugins).toContain(wasm);
    expect(config.plugins).toContain(ts);
  });

  it('addPlugin() mixed array is correctly split by isWasmPlugin', () => {
    const wasm = mockWasmPlugin('physics', 'Physics2D');
    const ts = mockTsPlugin('input');
    const config = new ConfigBuilder().addPlugin(wasm).addPlugin(ts).build();

    const wasmList = (config.plugins ?? []).filter(isWasmPlugin);
    const tsList = (config.plugins ?? []).filter((p) => !isWasmPlugin(p));

    expect(wasmList.length).toBe(1);
    expect(tsList.length).toBe(1);
  });

  it('deprecated addWasmPlugin() still works (uses legacy wasmPlugins array)', () => {
    const wasm = mockWasmPlugin('physics', 'Physics2D');
    const config = new ConfigBuilder().addWasmPlugin(wasm).build();

    expect(config.wasmPlugins).toContain(wasm);
    expect(config.wasmPlugins?.length).toBe(1);
  });

  it('deprecated addTsPlugin() still works (uses legacy tsPlugins array)', () => {
    const ts = mockTsPlugin('input');
    const config = new ConfigBuilder().addTsPlugin(ts).build();

    expect(config.tsPlugins).toContain(ts);
    expect(config.tsPlugins?.length).toBe(1);
  });

  it('supports full chaining', () => {
    const config = new ConfigBuilder()
      .setMaxEntities(5000)
      .setTargetFPS(60)
      .enableDebug()
      .addPlugin(mockWasmPlugin('physics', 'Physics'))
      .addPlugin(mockTsPlugin('input'))
      .build();

    expect(config.maxEntities).toBe(5000);
    expect(config.debug).toBe(true);
    expect(config.plugins?.length).toBe(2);
  });

  it('build() result always has plugins, wasmPlugins, tsPlugins arrays', () => {
    const config = new ConfigBuilder().build();
    expect(Array.isArray(config.plugins)).toBe(true);
    expect(Array.isArray(config.wasmPlugins)).toBe(true);
    expect(Array.isArray(config.tsPlugins)).toBe(true);
  });
});

// ── Integration ───────────────────────────────────────────────────────────────

describe('Integration — defineConfig + mergeConfigs', () => {
  it('defineConfig result can be merged with defaultConfig', () => {
    const config = defineConfig({
      engine: { maxEntities: 10_000 },
      plugins: [mockWasmPlugin('physics', 'Physics'), mockTsPlugin('input')],
    });

    const merged = mergeConfigs(defaultConfig, config as unknown as Partial<EngineConfig>);

    expect(merged.maxEntities).toBe(10_000);
    expect(merged.plugins?.length).toBe(2);
  });

  it('legacy wasmPlugins from defineConfig are preserved through mergeConfigs', () => {
    const config = defineConfig({
      wasmPlugins: [mockWasmPlugin('physics', 'Physics')],
    });

    const merged = mergeConfigs(defaultConfig, config as unknown as Partial<EngineConfig>);

    expect(merged.wasmPlugins?.length).toBe(1);
  });
});
