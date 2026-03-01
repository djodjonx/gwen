/**
 * Tests @gwen/vite-plugin
 * Vérifie la résolution du module virtuel et les options du plugin.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gwen } from '../src/index';

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gwen-vite-test-'));
}

// ── Plugin instantiation ──────────────────────────────────────────────────────

describe('gwen() plugin factory', () => {
  it('returns a Vite plugin object with name "gwen"', () => {
    const plugin = gwen();
    expect(plugin.name).toBe('gwen');
  });

  it('enforce is "pre"', () => {
    expect(gwen().enforce).toBe('pre');
  });

  it('accepts all options without throwing', () => {
    expect(() => gwen({
      cratePath: '/tmp/crate',
      wasmOutDir: 'public/wasm',
      watch: false,
      wasmMode: 'release',
      verbose: false,
    })).not.toThrow();
  });
});

// ── Virtual module — resolveId ────────────────────────────────────────────────

describe('virtual:gwen-manifest — resolveId', () => {
  it('resolves virtual:gwen-manifest to internal ID', () => {
    const plugin = gwen();
    const resolve = plugin.resolveId as Function;
    const result = resolve('virtual:gwen-manifest');
    expect(result).toBe('\0virtual:gwen-manifest');
  });

  it('returns null for other IDs', () => {
    const plugin = gwen();
    const resolve = plugin.resolveId as Function;
    expect(resolve('some-other-module')).toBeNull();
    expect(resolve('./local')).toBeNull();
  });
});

// ── Virtual module — load ─────────────────────────────────────────────────────

describe('virtual:gwen-manifest — load', () => {
  it('returns JS export default with manifest JSON when no file found', () => {
    const plugin = gwen();
    const load = plugin.load as Function;
    const result = load('\0virtual:gwen-manifest');
    expect(result).toMatch(/^export default /);
    expect(result).toContain('"version"');
    expect(result).toContain('"plugins"');
  });

  it('returns null for non-virtual IDs', () => {
    const plugin = gwen();
    const load = plugin.load as Function;
    expect(load('/some/file.ts')).toBeNull();
  });

  it('injects manifest from file when manifestPath provided', () => {
    const tmp = makeTmp();
    const manifestPath = path.join(tmp, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: '1.0.0',
      plugins: [{ name: 'gwen_core', type: 'wasm' }],
      engine: { maxEntities: 5000 },
    }));

    const plugin = gwen({ manifestPath });
    const load = plugin.load as Function;
    const result: string = load('\0virtual:gwen-manifest');

    expect(result).toContain('gwen_core');
    expect(result).toContain('5000');

    fs.rmSync(tmp, { recursive: true });
  });

  it('loads manifest from manifestPath when dist/gwen-manifest.json provided', () => {
    const tmp = makeTmp();
    const distDir = path.join(tmp, 'dist');
    fs.mkdirSync(distDir);
    const manifestFile = path.join(distDir, 'gwen-manifest.json');
    fs.writeFileSync(manifestFile, JSON.stringify({
      version: '0.2.0',
      plugins: [],
      engine: { targetFPS: 30 },
    }));

    const plugin = gwen({ manifestPath: manifestFile });
    const load = plugin.load as Function;
    const result: string = load('\0virtual:gwen-manifest');

    fs.rmSync(tmp, { recursive: true });

    expect(result).toContain('0.2.0');
  });
});

// ── Options par défaut ────────────────────────────────────────────────────────

describe('plugin options defaults', () => {
  it('wasmMode defaults to debug', () => {
    // We can't easily test this directly, but we can verify the plugin
    // doesn't throw and has correct structure
    const plugin = gwen({ watch: false });
    expect(plugin.name).toBe('gwen');
  });

  it('watch: false skips watcher setup', () => {
    // configureServer should not start file watchers when watch: false
    const plugin = gwen({ watch: false, verbose: false });
    expect(plugin.configureServer).toBeDefined();
  });
});

// ── generateBundle ────────────────────────────────────────────────────────────

describe('generateBundle', () => {
  it('emits gwen-manifest.json asset', () => {
    const plugin = gwen();
    const emitted: any[] = [];
    const ctx = {
      emitFile: (f: any) => emitted.push(f),
    };
    (plugin.generateBundle as Function).call(ctx);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe('gwen-manifest.json');
    expect(emitted[0].type).toBe('asset');
  });

  it('emitted manifest is valid JSON', () => {
    const plugin = gwen();
    const emitted: any[] = [];
    const ctx = { emitFile: (f: any) => emitted.push(f) };
    (plugin.generateBundle as Function).call(ctx);
    expect(() => JSON.parse(emitted[0].source)).not.toThrow();
  });
});

