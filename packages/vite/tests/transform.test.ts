import { describe, it, expect, vi } from 'vitest';
import { gwenTransform } from '../src/transform';

describe('gwenTransform() RFC-008 foundation', () => {
  it('returns a Vite pre plugin named gwen-transform', () => {
    const plugin = gwenTransform();
    expect(plugin.name).toBe('gwen-transform');
    expect(plugin.enforce).toBe('pre');
    expect(typeof plugin.transform).toBe('function');
  });

  it('ignores node_modules by default', () => {
    const plugin = gwenTransform();
    const out = (plugin.transform as Function)(
      'export const x = 1;',
      '/repo/node_modules/pkg/index.ts',
    );
    expect(out).toBeNull();
  });

  it('ignores non-js/ts files by default', () => {
    const plugin = gwenTransform();
    const out = (plugin.transform as Function)('body { color: red; }', '/repo/src/style.css');
    expect(out).toBeNull();
  });

  it('accepts matching TS source and remains no-op by default', () => {
    const plugin = gwenTransform();
    const out = (plugin.transform as Function)('export const x = 1;', '/repo/src/game/system.ts');
    expect(out).toBeNull();
  });

  it('injects auto-imports when enabled and symbols are used', () => {
    const plugin = gwenTransform({ autoImports: true });
    const out = (plugin.transform as Function)(
      'const Position = defineComponent({ name: "Position", schema: { x: Types.f32 } });',
      '/repo/src/components/position.ts',
    );

    expect(out).not.toBeNull();
    expect(out.code).toContain("import { defineComponent, Types } from '@gwenengine/core';");
  });

  it('does not inject auto-import if core import already exists', () => {
    const plugin = gwenTransform({ autoImports: true });
    const source = [
      "import { defineSystem } from '@gwenengine/core';",
      'export const S = defineSystem({ name: "S", onUpdate() {} });',
    ].join('\n');
    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).toBeNull();
  });

  it('merges missing named imports into existing core named import', () => {
    const plugin = gwenTransform({ autoImports: true });
    const source = [
      "import { defineSystem } from '@gwenengine/core';",
      'const Position = defineComponent({ name: "Position", schema: { x: Types.f32 } });',
      'export const S = defineSystem({ name: "S", onUpdate() {} });',
    ].join('\n');

    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain(
      "import { defineSystem, defineComponent, Types } from '@gwenengine/core';",
    );
  });

  it('adds a dedicated named import when only default core import exists', () => {
    const plugin = gwenTransform({ autoImports: true });
    const source = [
      "import Gwen from '@gwenengine/core';",
      'const Position = defineComponent({ name: "Position", schema: { x: Types.f32 } });',
      'console.log(Gwen);',
    ].join('\n');

    const out = (plugin.transform as Function)(source, '/repo/src/components/c.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain(
      "import Gwen from '@gwenengine/core';\nimport { defineComponent, Types } from '@gwenengine/core';",
    );
  });

  it('rewrites literal query arrays to as const when compileSystems is enabled', () => {
    const plugin = gwenTransform({ compileSystems: true });
    const out = (plugin.transform as Function)(
      'export const S = defineSystem({ name: "S", query: [Position, Velocity], onUpdate() {} });',
      '/repo/src/systems/s.ts',
    );
    expect(out).not.toBeNull();
    expect(out.code).toContain('query: [Position, Velocity] as const');
  });

  it('does not duplicate as const when already present', () => {
    const plugin = gwenTransform({ compileSystems: true });
    const source = 'export const S = defineSystem({ query: [Position] as const });';
    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).toBeNull();
  });

  it('rewrites simple schema objects to as const when compileComponents is enabled', () => {
    const plugin = gwenTransform({ compileComponents: true });
    const out = (plugin.transform as Function)(
      'export const Position = defineComponent({ name: "Position", schema: { x: Types.f32, y: Types.f32 } });',
      '/repo/src/components/position.ts',
    );
    expect(out).not.toBeNull();
    expect(out.code).toContain('schema: { x: Types.f32, y: Types.f32 } as const');
  });

  it('does not duplicate schema as const when already present', () => {
    const plugin = gwenTransform({ compileComponents: true });
    const source =
      'export const Position = defineComponent({ schema: { x: Types.f32 } as const, name: "P" });';
    const out = (plugin.transform as Function)(source, '/repo/src/components/p.ts');
    expect(out).toBeNull();
  });

  it('rewrites nested schema objects to as const', () => {
    const plugin = gwenTransform({ compileComponents: true });
    const source =
      'export const T = defineComponent({ name: "T", schema: { position: Types.vec3, nested: { x: Types.f32 } } });';
    const out = (plugin.transform as Function)(source, '/repo/src/components/t.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain(
      'schema: { position: Types.vec3, nested: { x: Types.f32 } } as const',
    );
  });

  it('does not rewrite non-object schema values', () => {
    const plugin = gwenTransform({ compileComponents: true });
    const source = 'export const T = defineComponent({ name: "T", schema: Types.vec3 });';
    const out = (plugin.transform as Function)(source, '/repo/src/components/t.ts');
    expect(out).toBeNull();
  });

  // ─── Edge cases — multiline query arrays ────────────────────────────────────

  it('rewrites multiline query arrays to as const', () => {
    const plugin = gwenTransform({ compileSystems: true });
    const source = [
      'export const S = defineSystem({',
      '  name: "S",',
      '  query: [',
      '    Position,',
      '    Velocity,',
      '  ],',
      '  onUpdate() {}',
      '});',
    ].join('\n');
    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain('] as const');
  });

  it('does not duplicate as const on multiline query array already present', () => {
    const plugin = gwenTransform({ compileSystems: true });
    const source = [
      'export const S = defineSystem({',
      '  query: [',
      '    Position,',
      '    Velocity,',
      '  ] as const,',
      '});',
    ].join('\n');
    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).toBeNull();
  });

  it('rewrites query array with string-based component type names', () => {
    const plugin = gwenTransform({ compileSystems: true });
    const source = 'const S = defineSystem({ query: ["position", "velocity"], onUpdate() {} });';
    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain('query: ["position", "velocity"] as const');
  });

  it('rewrites multiple query arrays in the same file', () => {
    const plugin = gwenTransform({ compileSystems: true });
    const source = [
      'const A = defineSystem({ query: [Position], onUpdate() {} });',
      'const B = defineSystem({ query: [Velocity, Health], onUpdate() {} });',
    ].join('\n');
    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain('query: [Position] as const');
    expect(out.code).toContain('query: [Velocity, Health] as const');
  });

  // ─── Edge cases — mixed imports ───────────────────────────────────────────────

  it('handles autoImports + compileSystems together', () => {
    const plugin = gwenTransform({ autoImports: true, compileSystems: true });
    const source = 'const S = defineSystem({ name: "S", query: [Position], onUpdate() {} });';
    const out = (plugin.transform as Function)(source, '/repo/src/systems/s.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain("import { defineSystem } from '@gwenengine/core'");
    expect(out.code).toContain('query: [Position] as const');
  });

  it('handles autoImports + compileComponents together', () => {
    const plugin = gwenTransform({ autoImports: true, compileComponents: true });
    const source = 'const P = defineComponent({ name: "P", schema: { x: Types.f32 } });';
    const out = (plugin.transform as Function)(source, '/repo/src/components/p.ts');
    expect(out).not.toBeNull();
    expect(out.code).toContain("import { defineComponent, Types } from '@gwenengine/core'");
    expect(out.code).toContain('schema: { x: Types.f32 } as const');
  });

  it('uses custom include/exclude predicates', () => {
    const include = vi.fn((id: string) => id.endsWith('.my.ts'));
    const exclude = vi.fn(() => false);

    const plugin = gwenTransform({ include, exclude });
    const transform = plugin.transform as Function;

    expect(transform('export const ok = true;', '/repo/src/a.ts')).toBeNull();
    expect(transform('export const ok = true;', '/repo/src/a.my.ts')).toBeNull();

    expect(include).toHaveBeenCalledTimes(2);
    expect(exclude).toHaveBeenCalledTimes(2);
  });
});
