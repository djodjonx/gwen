/**
 * Unit tests for validation schemas
 * Tests Zod validation with various inputs
 */

import { describe, it, expect } from 'vitest';
import { resolveConfig, validateResolvedConfig } from '@gwenjs/schema';
import type { GwenConfigInput, GwenPluginBase, GwenOptions } from '@gwenjs/schema';

describe('CLI config validation via @gwenjs/schema', () => {
  it('applies defaults for empty input', () => {
    const conf = resolveConfig({});
    expect(conf.engine.maxEntities).toBe(5000);
    expect(conf.engine.targetFPS).toBe(60);
    expect(conf.html.title).toBe('GWEN Project');
    expect(conf.plugins).toEqual([]);
  });

  it('merges legacy tsPlugins/wasmPlugins into plugins', () => {
    const tsPlugin: GwenPluginBase = { name: 'ts-plugin' };
    const wasmPlugin: GwenPluginBase = { name: 'wasm-plugin', wasm: { id: 'w' } };
    const input: GwenConfigInput = { tsPlugins: [tsPlugin], wasmPlugins: [wasmPlugin] };
    const conf = resolveConfig(input);

    expect(conf.plugins).toHaveLength(2);
    expect(conf.plugins).toContain(tsPlugin);
    expect(conf.plugins).toContain(wasmPlugin);
  });

  it('rejects invalid maxEntities with stable message', () => {
    expect(() => resolveConfig({ engine: { maxEntities: 50 } })).toThrow(
      'maxEntities must be between 100 and 1000000',
    );
  });

  it('rejects invalid targetFPS with stable message', () => {
    expect(() => resolveConfig({ engine: { targetFPS: 300 } })).toThrow(
      'targetFPS must be between 30 and 240',
    );
  });

  it('rejects invalid background with stable message', () => {
    const invalid = {
      ...resolveConfig({}),
      html: { title: 'GWEN Project', background: '#gggggg' },
    } as unknown as GwenOptions;
    expect(() => validateResolvedConfig(invalid)).toThrow('background must be a valid hex color');
  });
});
