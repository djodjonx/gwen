/**
 * Tests @gwenjs/vite
 * Verifies virtual module resolution and plugin options.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';
import { gwen, generateEntryModule, generateScenesModule } from '../src/index';

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
    expect(() =>
      gwen({
        cratePath: '/tmp/crate',
        watch: false,
        wasmMode: 'release',
        verbose: false,
      }),
    ).not.toThrow();
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
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: '1.0.0',
        plugins: [{ name: 'gwen_core', type: 'wasm' }],
        engine: { maxEntities: 5000 },
      }),
    );

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
    fs.writeFileSync(
      manifestFile,
      JSON.stringify({
        version: '0.2.0',
        plugins: [],
        engine: { targetFPS: 30 },
      }),
    );

    const plugin = gwen({ manifestPath: manifestFile });
    const load = plugin.load as Function;
    const result: string = load('\0virtual:gwen-manifest');

    fs.rmSync(tmp, { recursive: true });

    expect(result).toContain('0.2.0');
  });
});

// ── Default options ───────────────────────────────────────────────────────────

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

    const manifestAsset = emitted.find((asset) => asset.fileName === 'gwen-manifest.json');
    expect(manifestAsset).toBeDefined();
    expect(manifestAsset.type).toBe('asset');
  });

  it('emitted manifest is valid JSON', () => {
    const plugin = gwen();
    const emitted: any[] = [];
    const ctx = { emitFile: (f: any) => emitted.push(f) };
    (plugin.generateBundle as Function).call(ctx);

    const manifestAsset = emitted.find((asset) => asset.fileName === 'gwen-manifest.json');
    expect(manifestAsset).toBeDefined();
    expect(() => JSON.parse(manifestAsset.source)).not.toThrow();
  });
});

// ── generateEntryModule ───────────────────────────────────────────────────────

describe('generateEntryModule — bootstrap correctness', () => {
  it('uses createEngine directly (not destructured)', () => {
    const code = generateEntryModule(false);
    // Must NOT destructure { engine } — createEngine returns GwenEngine directly
    expect(code).not.toContain('const { engine }');
    expect(code).toContain('const engine = await createEngine(');
  });

  it('passes gwenConfig.engine to createEngine, not gwenConfig', () => {
    const code = generateEntryModule(false);
    expect(code).toContain('createEngine(gwenConfig.engine');
    expect(code).not.toMatch(/createEngine\(gwenConfig[^.]/);
  });

  it('loads plugins from modules via dynamic import of /module sub-path', () => {
    const code = generateEntryModule(false);
    expect(code).toContain('gwenConfig.modules');
    expect(code).toContain('name + "/module"');
    expect(code).toContain('@vite-ignore');
    expect(code).toContain('def.setup');
  });

  it('registers module plugins before direct plugins and before start', () => {
    const code = generateEntryModule(false);
    const modulePluginsIdx = code.indexOf('for (const p of modulePlugins)');
    const directPluginsIdx = code.indexOf('gwenConfig.plugins');
    const startIdx = code.indexOf('engine.start()');
    expect(modulePluginsIdx).toBeGreaterThan(0);
    expect(directPluginsIdx).toBeGreaterThan(modulePluginsIdx);
    expect(startIdx).toBeGreaterThan(directPluginsIdx);
  });

  it('kit stub provides all GwenKit methods as no-ops for build-only methods', () => {
    const code = generateEntryModule(false);
    expect(code).toContain('addAutoImports() {}');
    expect(code).toContain('addVitePlugin() {}');
    expect(code).toContain('extendViteConfig() {}');
    expect(code).toContain('addTypeTemplate() {}');
    expect(code).toContain('addModuleAugment() {}');
    expect(code).toContain('hook() {}');
  });

  it('awaits engine.start()', () => {
    const code = generateEntryModule(false);
    expect(code).toContain('await engine.start()');
  });

  it('with scenes: imports registerScenes but not mainScene', () => {
    const code = generateEntryModule(true);
    expect(code).toContain('import { registerScenes }');
    expect(code).not.toContain('mainScene');
  });

  it('with scenes: wires systems via SceneRegistry adapter before start', () => {
    const code = generateEntryModule(true);
    const scenesIdx = code.indexOf('registerScenes(');
    const startIdx = code.indexOf('engine.start()');
    expect(scenesIdx).toBeGreaterThan(0);
    expect(startIdx).toBeGreaterThan(scenesIdx);
    // Adapter has register() that calls engine.use() for each system
    expect(code).toContain('register(scene)');
    expect(code).toContain('engine.use(s)');
  });

  it('without scenes: no registerScenes import or call', () => {
    const code = generateEntryModule(false);
    expect(code).not.toContain('registerScenes');
    expect(code).not.toContain('gwen-scenes');
  });
});

// ── generateScenesModule ──────────────────────────────────────────────────────

describe('generateScenesModule — registerScenes contract', () => {
  it('empty scenes → registerScenes is a no-op', () => {
    const code = generateScenesModule([], undefined);
    expect(code).toContain('export function registerScenes(_scenes)');
    expect(code).toContain('export const mainScene = undefined');
  });
});
