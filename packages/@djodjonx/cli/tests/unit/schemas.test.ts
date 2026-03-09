/**
 * Unit tests for validation schemas
 */

import { describe, it, expect } from 'vitest';
import { resolveConfig, validateResolvedConfig } from '@djodjonx/gwen-schema';

describe('@djodjonx/gwen-schema contract used by CLI', () => {
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
    expect(resolveConfig({ html: { background: '#fff' } as any }).html.background).toBe('#fff');
    expect(resolveConfig({ html: { background: '#ffffff' } as any }).html.background).toBe(
      '#ffffff',
    );
  });

  it('rejects background if not hex', () => {
    expect(() => resolveConfig({ html: { background: 'red' as any } as any })).toThrow(
      'background must be a valid hex color',
    );
  });

  it('rejects invalid plugins container', () => {
    expect(() =>
      validateResolvedConfig({ ...resolveConfig({}), plugins: {} as any } as any),
    ).toThrow('plugins must be an array');
  });
});
