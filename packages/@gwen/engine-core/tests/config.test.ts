/**
 * Configuration System Tests
 */

import { describe, it, expect, vi } from 'vitest';
import type { EngineConfig, GwenWasmPlugin } from '../src/types';
import { defineConfig, ConfigBuilder, defaultConfig, mergeConfigs } from '../src/config/config';

/** Minimal GwenWasmPlugin stub for config tests — no real WASM logic needed. */
function mockWasmPlugin(id: string, name: string): GwenWasmPlugin {
  return { id, name, sharedMemoryBytes: 0, onInit: vi.fn() } as unknown as GwenWasmPlugin;
}

describe('Configuration', () => {
  describe('defaultConfig', () => {
    it('should have sensible defaults', () => {
      expect(defaultConfig.maxEntities).toBe(5000);
      expect(defaultConfig.targetFPS).toBe(60);
      expect(defaultConfig.debug).toBe(false);
      expect(defaultConfig.enableStats).toBe(true);
      expect(Array.isArray(defaultConfig.wasmPlugins)).toBe(true);
      expect(Array.isArray(defaultConfig.tsPlugins)).toBe(true);
    });

    it('should NOT have rendering config', () => {
      expect((defaultConfig as any).canvas).toBeUndefined();
      expect((defaultConfig as any).width).toBeUndefined();
      expect((defaultConfig as any).height).toBeUndefined();
    });
  });

  describe('defineConfig', () => {
    it('should return config object', () => {
      const config = defineConfig({
        maxEntities: 10000,
        targetFPS: 120,
      });

      expect(config.maxEntities).toBe(10000);
      expect(config.targetFPS).toBe(120);
    });

    it('should support wasm plugins', () => {
      const config = defineConfig({
        wasmPlugins: [
          { id: 'physics', name: 'Physics', sharedMemoryBytes: 0, onInit: async () => {} },
        ],
      });

      expect(config.wasmPlugins?.length).toBe(1);
    });

    it('should support TypeScript plugins', () => {
      const config = defineConfig({
        tsPlugins: [{ name: 'input' } as any],
      });

      expect(config.tsPlugins?.length).toBe(1);
    });
  });

  describe('mergeConfigs', () => {
    it('should merge with defaults', () => {
      const user = { maxEntities: 10000 };
      const merged = mergeConfigs(defaultConfig, user);

      expect(merged.maxEntities).toBe(10000);
      expect(merged.targetFPS).toBe(defaultConfig.targetFPS);
    });

    it('should prefer user config', () => {
      const user = { targetFPS: 120 };
      const merged = mergeConfigs(defaultConfig, user);

      expect(merged.targetFPS).toBe(120);
    });

    it('should merge plugin arrays', () => {
      const defaults = {
        ...defaultConfig,
        wasmPlugins: [
          { id: 'physics', name: 'Physics', sharedMemoryBytes: 0, onInit: vi.fn() },
        ] as GwenWasmPlugin[],
      };
      const user = {
        wasmPlugins: [
          { id: 'ai', name: 'AIEngine', sharedMemoryBytes: 0, onInit: vi.fn() },
        ] as GwenWasmPlugin[],
      };
      const merged = mergeConfigs(defaults, user);

      expect(merged.wasmPlugins?.length).toBe(2);
    });
  });

  describe('ConfigBuilder', () => {
    it('should create builder', () => {
      const builder = new ConfigBuilder();
      expect(builder).toBeDefined();
    });

    it('should set max entities', () => {
      const config = new ConfigBuilder().setMaxEntities(10000).build();

      expect(config.maxEntities).toBe(10000);
    });

    it('should set target FPS', () => {
      const config = new ConfigBuilder().setTargetFPS(120).build();

      expect(config.targetFPS).toBe(120);
    });

    it('should add WASM plugins', () => {
      const wasmPlugin1 = mockWasmPlugin('physics', 'Physics2D');
      const wasmPlugin2 = mockWasmPlugin('ai', 'AIEngine');

      const config = new ConfigBuilder()
        .addWasmPlugin(wasmPlugin1)
        .addWasmPlugin(wasmPlugin2)
        .build();

      expect(config.wasmPlugins).toContain(wasmPlugin1);
      expect(config.wasmPlugins).toContain(wasmPlugin2);
      expect(config.wasmPlugins?.length).toBe(2);
    });

    it('should add TypeScript plugins', () => {
      const tsPlugin1 = { name: 'input', version: '1.0.0' };
      const tsPlugin2 = { name: 'audio', version: '1.0.0' };

      const config = new ConfigBuilder().addTsPlugin(tsPlugin1).addTsPlugin(tsPlugin2).build();

      expect(config.tsPlugins).toContain(tsPlugin1);
      expect(config.tsPlugins).toContain(tsPlugin2);
      expect(config.tsPlugins?.length).toBe(2);
    });

    it('should separate WASM and TS plugins', () => {
      const wasmPlugin = mockWasmPlugin('physics', 'Physics');
      const tsPlugin = { name: 'input' };

      const config = new ConfigBuilder().addWasmPlugin(wasmPlugin).addTsPlugin(tsPlugin).build();

      expect(config.wasmPlugins?.length).toBe(1);
      expect(config.tsPlugins?.length).toBe(1);
      expect(config.wasmPlugins).toContain(wasmPlugin);
      expect(config.tsPlugins).toContain(tsPlugin);
    });

    it('should enable/disable debug', () => {
      let config = new ConfigBuilder().enableDebug().build();
      expect(config.debug).toBe(true);

      config = new ConfigBuilder().disableDebug().build();
      expect(config.debug).toBe(false);
    });

    it('should enable/disable stats', () => {
      let config = new ConfigBuilder().enableStats().build();
      expect(config.enableStats).toBe(true);

      config = new ConfigBuilder().disableStats().build();
      expect(config.enableStats).toBe(false);
    });

    it('should support chaining', () => {
      const config = new ConfigBuilder()
        .setMaxEntities(5000)
        .setTargetFPS(60)
        .addWasmPlugin(mockWasmPlugin('physics', 'Physics'))
        .addTsPlugin({ name: 'input' })
        .enableDebug()
        .build();

      expect(config.maxEntities).toBe(5000);
      expect(config.targetFPS).toBe(60);
      expect(config.debug).toBe(true);
      expect(config.wasmPlugins?.length).toBe(1);
      expect(config.tsPlugins?.length).toBe(1);
    });

    it('should return engine config with all fields', () => {
      const config = new ConfigBuilder().build();
      expect(config).toHaveProperty('maxEntities');
      expect(config).toHaveProperty('targetFPS');
      expect(config).toHaveProperty('debug');
      expect(config).toHaveProperty('wasmPlugins');
      expect(config).toHaveProperty('tsPlugins');
    });
  });

  describe('Integration', () => {
    it('should work with defineConfig', () => {
      const config = defineConfig({
        maxEntities: 10000,
        wasmPlugins: [
          { id: 'physics', name: 'Physics', sharedMemoryBytes: 0, onInit: async () => {} },
        ],
        tsPlugins: [{ name: 'input' }],
      });

      // defineConfig returns TypedEngineConfig with 'tsPlugins', but mergeConfigs expects EngineConfig with 'tsPlugins'
      const merged = mergeConfigs(defaultConfig, config as EngineConfig);

      expect(merged.maxEntities).toBe(10000);
      expect(merged.wasmPlugins?.length).toBe(1);
      expect(merged.tsPlugins?.length).toBe(1);
    });

    it('should merge defineConfig with defaults', () => {
      const config = defineConfig({
        wasmPlugins: [
          { id: 'physics', name: 'Physics', sharedMemoryBytes: 0, onInit: vi.fn() },
        ] as GwenWasmPlugin[],
      });

      const merged = mergeConfigs(defaultConfig, config as unknown as Partial<EngineConfig>);

      expect(merged.wasmPlugins?.length).toBe(1);
      expect(merged.tsPlugins?.length).toBe(0);
      expect(merged.maxEntities).toBe(defaultConfig.maxEntities);
    });
  });
});
