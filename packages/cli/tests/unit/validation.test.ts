/**
 * Unit tests for validation schemas
 * Tests Zod validation with various inputs
 */

import { describe, it, expect } from 'vitest';
import { resolveConfig, validateResolvedConfig } from '@gwenengine/schema';

describe('CLI config validation via @gwenengine/schema', () => {
  it('applies defaults for empty input', () => {
    const conf = resolveConfig({});
    expect(conf.engine.maxEntities).toBe(5000);
    expect(conf.engine.targetFPS).toBe(60);
    expect(conf.html.title).toBe('GWEN Project');
    expect(conf.plugins).toEqual([]);
  });

  it('merges legacy tsPlugins/wasmPlugins into plugins', () => {
    const tsPlugin = { name: 'ts-plugin' };
    const wasmPlugin = { name: 'wasm-plugin', wasm: { id: 'w' } };
    const conf = resolveConfig({ tsPlugins: [tsPlugin], wasmPlugins: [wasmPlugin] } as any);

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
    expect(() =>
      validateResolvedConfig(
        resolveConfig({ html: { background: '#gggggg' as any } as any }) as any,
      ),
    ).toThrow('background must be a valid hex color');
  });
});
