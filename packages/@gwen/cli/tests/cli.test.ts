/**
 * Tests @gwen/cli
 * - config-parser: findConfigFile, parseConfigFile
 * - builder: build() en mode dry-run
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findConfigFile, parseConfigFile } from '../src/config-parser';
import { build } from '../src/builder';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gwen-cli-test-'));
}

function writeConfig(dir: string, content: string, filename = 'engine.config.ts'): string {
  const p = path.join(dir, filename);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

const MINIMAL_CONFIG = `
import { Engine } from '@gwen/engine-core';
export const engine = new Engine({ maxEntities: 500, targetFPS: 30, debug: true });
`;

const FULL_CONFIG = `
import { Engine, SceneManager, UIManager } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';

export const engine = new Engine({ maxEntities: 2000, targetFPS: 60, debug: false });
export const scenes = new SceneManager();

export function configureEngine() {
  engine.registerSystem(scenes);
  engine.registerSystem(new UIManager());
  engine.registerSystem(new InputPlugin());
  engine.registerSystem(new AudioPlugin());
  scenes.loadScene('MainMenu');
  scenes.register('GameScene', () => {});
  return { engine, scenes };
}
`;

// ── findConfigFile ────────────────────────────────────────────────────────────

describe('findConfigFile', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('finds engine.config.ts in the same directory', () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    expect(findConfigFile(tmp)).toBe(path.join(tmp, 'engine.config.ts'));
  });

  it('finds gwen.config.ts as alternative', () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    expect(findConfigFile(tmp)).toBe(path.join(tmp, 'gwen.config.ts'));
  });

  it('finds config in parent directory', () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    const subdir = path.join(tmp, 'src');
    fs.mkdirSync(subdir);
    expect(findConfigFile(subdir)).toBe(path.join(tmp, 'engine.config.ts'));
  });

  it('returns null when no config found', () => {
    expect(findConfigFile(tmp)).toBeNull();
  });

  it('prefers engine.config.ts over gwen.config.ts', () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'engine.config.ts');
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    expect(findConfigFile(tmp)).toBe(path.join(tmp, 'engine.config.ts'));
  });
});

// ── parseConfigFile — engine config ──────────────────────────────────────────

describe('parseConfigFile — engine config', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('extracts maxEntities', () => {
    const p = writeConfig(tmp, MINIMAL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.engine.maxEntities).toBe(500);
  });

  it('extracts targetFPS', () => {
    const p = writeConfig(tmp, MINIMAL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.engine.targetFPS).toBe(30);
  });

  it('extracts debug: true', () => {
    const p = writeConfig(tmp, MINIMAL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.engine.debug).toBe(true);
  });

  it('uses defaults when values not found', () => {
    const p = writeConfig(tmp, `import { Engine } from '@gwen/engine-core';`);
    const result = parseConfigFile(p);
    expect(result.engine.maxEntities).toBe(10_000);
    expect(result.engine.targetFPS).toBe(60);
    expect(result.engine.debug).toBe(false);
  });

  it('returns configPath', () => {
    const p = writeConfig(tmp, MINIMAL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.configPath).toBe(p);
  });
});

// ── parseConfigFile — plugins ─────────────────────────────────────────────────

describe('parseConfigFile — plugins', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('extracts InputPlugin from @gwen/plugin-input', () => {
    const p = writeConfig(tmp, FULL_CONFIG);
    const result = parseConfigFile(p);
    const input = result.plugins.find(pl => pl.symbolName === 'InputPlugin');
    expect(input).toBeDefined();
    expect(input!.packageName).toBe('@gwen/plugin-input');
    expect(input!.type).toBe('ts');
  });

  it('extracts AudioPlugin from @gwen/plugin-audio', () => {
    const p = writeConfig(tmp, FULL_CONFIG);
    const result = parseConfigFile(p);
    const audio = result.plugins.find(pl => pl.symbolName === 'AudioPlugin');
    expect(audio).toBeDefined();
    expect(audio!.type).toBe('ts');
  });

  it('marks @gwen/plugin-physics2d as wasm type', () => {
    const src = `
      import { Physics2DPlugin } from '@gwen/plugin-physics2d';
      export const engine = new Engine({ maxEntities: 100, targetFPS: 60 });
    `;
    const p = writeConfig(tmp, src);
    const result = parseConfigFile(p);
    const phys = result.plugins.find(pl => pl.symbolName === 'Physics2DPlugin');
    expect(phys).toBeDefined();
    expect(phys!.type).toBe('wasm');
  });

  it('does not include non-plugin imports (Engine, SceneManager)', () => {
    const p = writeConfig(tmp, FULL_CONFIG);
    const result = parseConfigFile(p);
    const names = result.plugins.map(pl => pl.symbolName);
    expect(names).not.toContain('Engine');
    expect(names).not.toContain('SceneManager');
  });

  it('returns empty array when no plugins declared', () => {
    const p = writeConfig(tmp, MINIMAL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.plugins).toEqual([]);
  });

  it('does not duplicate plugins imported multiple times', () => {
    const src = `
      import { InputPlugin } from '@gwen/plugin-input';
      import { InputPlugin as IP } from '@gwen/plugin-input';
    `;
    const p = writeConfig(tmp, src);
    const result = parseConfigFile(p);
    const inputs = result.plugins.filter(pl => pl.packageName === '@gwen/plugin-input');
    expect(inputs.length).toBe(1);
  });
});

// ── parseConfigFile — scenes ──────────────────────────────────────────────────

describe('parseConfigFile — scenes', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('extracts scene names from loadScene()', () => {
    const p = writeConfig(tmp, FULL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.scenes).toContain('MainMenu');
  });

  it('extracts scene names from register()', () => {
    const p = writeConfig(tmp, FULL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.scenes).toContain('GameScene');
  });
});

// ── parseConfigFile — rust crate ─────────────────────────────────────────────

describe('parseConfigFile — rustCratePath', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('detects Cargo.toml in parent dir', () => {
    fs.writeFileSync(path.join(tmp, 'Cargo.toml'), '[workspace]', 'utf-8');
    const subdir = path.join(tmp, 'app');
    fs.mkdirSync(subdir);
    const p = writeConfig(subdir, MINIMAL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.rustCratePath).toBe(tmp);
  });

  it('returns null when no Cargo.toml found', () => {
    const p = writeConfig(tmp, MINIMAL_CONFIG);
    const result = parseConfigFile(p);
    expect(result.rustCratePath).toBeNull();
  });
});

// ── build() — dry-run ─────────────────────────────────────────────────────────

describe('build() — dry-run mode', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('returns success: false when no config found', async () => {
    const result = await build({ projectDir: tmp, dryRun: true });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/engine.config.ts/);
  });

  it('returns success: true with a valid config', async () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    const result = await build({ projectDir: tmp, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.configPath).toBeTruthy();
  });

  it('generates gwen-manifest.json in dist/', async () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    const outDir = path.join(tmp, 'dist');
    const result = await build({ projectDir: tmp, outDir, dryRun: true });
    expect(result.manifestPath).toBeTruthy();
    expect(fs.existsSync(result.manifestPath!)).toBe(true);
  });

  it('manifest contains engine config', async () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    const outDir = path.join(tmp, 'dist');
    await build({ projectDir: tmp, outDir, dryRun: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'gwen-manifest.json'), 'utf-8'));
    expect(manifest.engine.maxEntities).toBe(500);
    expect(manifest.engine.targetFPS).toBe(30);
  });

  it('manifest contains extracted plugins', async () => {
    writeConfig(tmp, FULL_CONFIG);
    const outDir = path.join(tmp, 'dist');
    await build({ projectDir: tmp, outDir, dryRun: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'gwen-manifest.json'), 'utf-8'));
    const names = manifest.plugins.map((p: any) => p.name);
    expect(names).toContain('InputPlugin');
    expect(names).toContain('AudioPlugin');
  });

  it('manifest includes gwen_core wasm entry when Cargo.toml found', async () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    fs.writeFileSync(path.join(tmp, 'Cargo.toml'), '[workspace]', 'utf-8');
    const outDir = path.join(tmp, 'dist');
    await build({ projectDir: tmp, outDir, dryRun: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'gwen-manifest.json'), 'utf-8'));
    const core = manifest.plugins.find((p: any) => p.name === 'gwen_core');
    expect(core).toBeDefined();
    expect(core.wasmPath).toBe('./wasm/gwen_core_bg.wasm');
    expect(core.jsPath).toBe('./wasm/gwen_core.js');
  });

  it('records durationMs', async () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    const result = await build({ projectDir: tmp, dryRun: true });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('succeeds in dry-run even without Cargo.toml (uses pre-compiled WASM path)', async () => {
    writeConfig(tmp, MINIMAL_CONFIG);
    const result = await build({ projectDir: tmp, dryRun: true });
    // dry-run always succeeds — WASM step is skipped entirely
    expect(result.success).toBe(true);
    expect(result.wasmBuilt).toBe(true);
  });
});

