import { describe, it, expect } from 'vitest';
import { extractLayerDefinitions, inlineLayerReferences } from '../src/vite-plugin.js';

describe('extractLayerDefinitions', () => {
  it('extracts simple numeric layers', () => {
    const code = `const Layers = defineLayers({ player: 1, enemy: 2, ground: 4 })`;
    const result = extractLayerDefinitions(code);
    expect(result?.get('player')).toBe(1);
    expect(result?.get('enemy')).toBe(2);
    expect(result?.get('ground')).toBe(4);
  });

  it('returns null when no defineLayers call', () => {
    expect(extractLayerDefinitions('const x = 5')).toBeNull();
  });

  it('returns null when defineLayers has an empty body', () => {
    expect(extractLayerDefinitions('defineLayers({})')).toBeNull();
  });

  it('extracts hex literal values', () => {
    const code = `const L = defineLayers({ a: 0x01, b: 0x02 })`;
    const result = extractLayerDefinitions(code);
    expect(result?.get('a')).toBe(1);
    expect(result?.get('b')).toBe(2);
  });

  it('returns a Map with the correct number of entries', () => {
    const code = `const L = defineLayers({ x: 1, y: 2, z: 4, w: 8 })`;
    const result = extractLayerDefinitions(code);
    expect(result?.size).toBe(4);
  });

  it('skips entries with complex expressions that cannot be evaluated', () => {
    // someVar cannot be evaluated statically
    const code = `const L = defineLayers({ a: 1, b: someVar })`;
    const result = extractLayerDefinitions(code);
    // 'a' should be parsed, 'b' may be skipped
    expect(result).not.toBeNull();
    expect(result?.get('a')).toBe(1);
  });
});

describe('inlineLayerReferences', () => {
  it('replaces Layers.player with numeric value', () => {
    const map = new Map([
      ['player', 1],
      ['enemy', 2],
    ]);
    const result = inlineLayerReferences('if (layer === Layers.player) {}', 'Layers', map);
    expect(result).toBe('if (layer === 1) {}');
  });

  it('replaces all occurrences of a layer reference', () => {
    const map = new Map([['ground', 4]]);
    const code = 'const a = Layers.ground; const b = Layers.ground;';
    const result = inlineLayerReferences(code, 'Layers', map);
    expect(result).toBe('const a = 4; const b = 4;');
  });

  it('replaces multiple different layer names', () => {
    const map = new Map([
      ['player', 1],
      ['enemy', 2],
    ]);
    const code = 'a = Layers.player; b = Layers.enemy;';
    const result = inlineLayerReferences(code, 'Layers', map);
    expect(result).toBe('a = 1; b = 2;');
  });

  it('does not replace partial identifier matches', () => {
    const map = new Map([['pl', 1]]);
    const code = 'Layers.player';
    const result = inlineLayerReferences(code, 'Layers', map);
    // 'pl' should not replace 'player' due to word boundary
    expect(result).toBe('Layers.player');
  });

  it('returns code unchanged when layerMap is empty', () => {
    const code = 'layer === Layers.enemy';
    const result = inlineLayerReferences(code, 'Layers', new Map());
    expect(result).toBe(code);
  });
});

describe('physics3dVitePlugin', () => {
  it('plugin has name gwen:physics3d', async () => {
    const { physics3dVitePlugin } = await import('../src/vite-plugin.js');
    const plugin = physics3dVitePlugin();
    expect(plugin.name).toBe('gwen:physics3d');
  });

  it('transform returns undefined for non-TS/JS files', async () => {
    const { physics3dVitePlugin } = await import('../src/vite-plugin.js');
    const plugin = physics3dVitePlugin();
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const result = transform('some code', 'styles.css');
    expect(result).toBeUndefined();
  });

  it('transform returns undefined when no defineLayers call', async () => {
    const { physics3dVitePlugin } = await import('../src/vite-plugin.js');
    const plugin = physics3dVitePlugin();
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const result = transform('const x = 5', 'file.ts');
    expect(result).toBeUndefined();
  });
});
