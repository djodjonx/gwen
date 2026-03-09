/**
 * GWEN Schema Configuration Tests
 *
 * Tests for configuration defaults, merging, and validation.
 */

import { describe, it, expect } from 'vitest';
import { defaultOptions, resolveConfig, validateResolvedConfig } from '../src';

describe('@djodjonx/gwen-schema - Configuration', () => {
  describe('defaultOptions', () => {
    it('should have all required default properties', () => {
      expect(defaultOptions.engine.maxEntities).toBe(5000);
      expect(defaultOptions.engine.targetFPS).toBe(60);
      expect(defaultOptions.engine.debug).toBe(false);
      expect(defaultOptions.engine.enableStats).toBe(true);
      expect(defaultOptions.html.title).toBe('GWEN Project');
      expect(defaultOptions.html.background).toBe('#000000');
      expect(defaultOptions.plugins).toEqual([]);
      expect(defaultOptions.scenes).toEqual([]);
      expect(defaultOptions.scenesMode).toBe('auto');
      expect(defaultOptions.srcDir).toBe('src');
      expect(defaultOptions.outDir).toBe('dist');
    });
  });

  describe('resolveConfig', () => {
    it('should apply defaults on empty config', () => {
      const config = resolveConfig({});
      expect(config.engine.maxEntities).toBe(5000);
      expect(config.engine.targetFPS).toBe(60);
      expect(config.srcDir).toBe('src');
      expect(config.outDir).toBe('dist');
    });

    it('should merge user config with defaults', () => {
      const config = resolveConfig({
        engine: { maxEntities: 10_000 },
        html: { title: 'My Game' },
      });
      expect(config.engine.maxEntities).toBe(10_000);
      expect(config.engine.targetFPS).toBe(60); // from default
      expect(config.html.title).toBe('My Game');
      expect(config.html.background).toBe('#000000'); // from default
    });

    it('should unify legacy tsPlugins into plugins array', () => {
      const plugin = { name: 'test-plugin' };
      const config = resolveConfig({
        tsPlugins: [plugin],
      } as any);
      expect(config.plugins).toContain(plugin);
    });

    it('should unify legacy wasmPlugins into plugins array', () => {
      const plugin = { name: 'wasm-plugin', wasm: {} };
      const config = resolveConfig({
        wasmPlugins: [plugin],
      } as any);
      expect(config.plugins).toContain(plugin);
    });

    it('should merge tsPlugins and wasmPlugins together', () => {
      const tsPlugin = { name: 'ts-plugin' };
      const wasmPlugin = { name: 'wasm-plugin', wasm: {} };
      const config = resolveConfig({
        tsPlugins: [tsPlugin],
        wasmPlugins: [wasmPlugin],
      } as any);
      expect(config.plugins).toHaveLength(2);
      expect(config.plugins).toContain(tsPlugin);
      expect(config.plugins).toContain(wasmPlugin);
    });

    it('should preserve mainScene if provided', () => {
      const config = resolveConfig({
        mainScene: 'MainMenu',
      });
      expect(config.mainScene).toBe('MainMenu');
    });

    it('should validate the resolved config', () => {
      expect(() => {
        resolveConfig({
          engine: { maxEntities: 50 }, // Too small
        });
      }).toThrow('maxEntities must be between 100 and 1000000');
    });
  });

  describe('validateResolvedConfig', () => {
    it('should accept valid config', () => {
      const config = validateResolvedConfig({
        ...defaultOptions,
      });
      expect(config).toBeDefined();
    });

    it('should reject maxEntities below minimum', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          engine: { ...defaultOptions.engine, maxEntities: 50 },
        });
      }).toThrow('maxEntities must be between 100 and 1000000');
    });

    it('should reject maxEntities above maximum', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          engine: { ...defaultOptions.engine, maxEntities: 10_000_000 },
        });
      }).toThrow('maxEntities must be between 100 and 1000000');
    });

    it('should reject non-integer maxEntities', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          engine: { ...defaultOptions.engine, maxEntities: 100.5 },
        });
      }).toThrow('maxEntities must be between 100 and 1000000');
    });

    it('should reject targetFPS below minimum', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          engine: { ...defaultOptions.engine, targetFPS: 20 },
        });
      }).toThrow('targetFPS must be between 30 and 240');
    });

    it('should reject targetFPS above maximum', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          engine: { ...defaultOptions.engine, targetFPS: 300 },
        });
      }).toThrow('targetFPS must be between 30 and 240');
    });

    it('should reject invalid background color', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          html: { ...defaultOptions.html, background: 'red' },
        });
      }).toThrow('background must be a valid hex color');
    });

    it('should accept valid hex colors (6 digit)', () => {
      const config = validateResolvedConfig({
        ...defaultOptions,
        html: { ...defaultOptions.html, background: '#ffffff' },
      });
      expect(config.html.background).toBe('#ffffff');
    });

    it('should accept valid hex colors (3 digit)', () => {
      const config = validateResolvedConfig({
        ...defaultOptions,
        html: { ...defaultOptions.html, background: '#fff' },
      });
      expect(config.html.background).toBe('#fff');
    });

    it('should reject invalid hex color format', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          html: { ...defaultOptions.html, background: '#gggggg' },
        });
      }).toThrow('background must be a valid hex color');
    });

    it('should reject if plugins is not an array', () => {
      expect(() => {
        validateResolvedConfig({
          ...defaultOptions,
          plugins: {} as any,
        });
      }).toThrow('plugins must be an array');
    });
  });
});
