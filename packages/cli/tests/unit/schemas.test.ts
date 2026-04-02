/**
 * Unit tests for validation schemas
 */

import { describe, it, expect } from 'vitest';
import { resolveConfig, validateResolvedConfig } from '@gwenjs/schema';
import type { GwenConfigInput, GwenPluginBase } from '@gwenjs/schema';

describe('@gwenjs/schema contract used by CLI', () => {
  it('accepts valid config', () => {
    const conf = resolveConfig({
      engine: { maxEntities: 10_000, targetFPS: 120 },
      html: { title: 'Test', background: '#1a1a1a' },
      plugins: [],
      scenes: ['MainScene'],
    });
    expect(conf.engine.maxEntities).toBe(10_000);
    expect(conf.scenes).toEqual(['MainScene']);
  });

  it('accepts #fff and #ffffff background formats', () => {
    const shortHex: GwenConfigInput = { html: { background: '#fff' } };
    const longHex: GwenConfigInput = { html: { background: '#ffffff' } };
    expect(resolveConfig(shortHex).html.background).toBe('#fff');
    expect(resolveConfig(longHex).html.background).toBe('#ffffff');
  });

  it('rejects background if not hex', () => {
    expect(() => resolveConfig({ html: { background: 'red' as unknown as string } })).toThrow(
      'background must be a valid hex color',
    );
  });

  it('rejects invalid plugins container', () => {
    expect(() =>
      validateResolvedConfig({
        ...resolveConfig({}),
        plugins: {} as unknown as GwenPluginBase[],
      }),
    ).toThrow('plugins must be an array');
  });
});
