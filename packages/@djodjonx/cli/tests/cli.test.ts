/**
 * Tests @djodjonx/gwen-cli
 * Integration tests for prepare and build operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build, prepare } from '../src';

// ── prepare ───────────────────────────────────────────────────────────────────

describe('prepare', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('fails gracefully if no gwen.config.ts found', async () => {
    const result = await prepare({ projectDir: tmp });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Config file|gwen.config.ts not found/);
  });

  it('generates .gwen/tsconfig.generated.json', async () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmp });
    expect(result.success).toBe(true);
    const tsconfig = path.join(tmp, '.gwen', 'tsconfig.generated.json');
    expect(fs.existsSync(tsconfig)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(tsconfig, 'utf-8'));
    expect(parsed.compilerOptions.strict).toBe(true);
    expect(parsed.compilerOptions.moduleResolution).toBe('bundler');
  });

  it('generates .gwen/gwen.d.ts', async () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmp });
    expect(result.success).toBe(true);
    const dts = path.join(tmp, '.gwen', 'gwen.d.ts');
    expect(fs.existsSync(dts)).toBe(true);
    const content = fs.readFileSync(dts, 'utf-8');
    expect(content).toContain('GwenDefaultServices');
    expect(content).toContain('GwenAPI');
    expect(content).toContain('declare global');
  });

  it('creates tsconfig.json if absent and sets extends', async () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmp });
    expect(result.success).toBe(true);
    const tsconfig = path.join(tmp, 'tsconfig.json');
    expect(fs.existsSync(tsconfig)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(tsconfig, 'utf-8'));
    expect(parsed.extends).toBe('./.gwen/tsconfig.generated.json');
  });

  it('adds .gwen/ to .gitignore', async () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmp });
    expect(result.success).toBe(true);
    const gitignore = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.gwen/');
  });

  it('returns list of generated files', async () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmp });
    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(3);
    expect(result.files.some((f: string) => f.endsWith('tsconfig.generated.json'))).toBe(true);
    expect(result.files.some((f: string) => f.endsWith('gwen.d.ts'))).toBe(true);
    expect(result.files.some((f: string) => f.endsWith('index.html'))).toBe(true);
  });
});

// ── build() — dry-run ─────────────────────────────────────────────────────────

describe('build() — dry-run mode', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns success: false when no config found', async () => {
    const result = await build({ projectDir: tmp, dryRun: true });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Config loading failed|gwen.config.ts|engine.config.ts/);
  });

  it('returns success: true with a valid config', async () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await build({ projectDir: tmp, dryRun: true });
    expect(result.success).toBe(true);
  });

  it('generates gwen-manifest.json in dist/', async () => {
    writeConfig(tmp, MINIMAL_CONFIG, 'gwen.config.ts');
    const outDir = path.join(tmp, 'dist');
    await build({ projectDir: tmp, outDir, dryRun: true });
    expect(fs.existsSync(path.join(outDir, 'gwen-manifest.json'))).toBe(true);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gwen-cli-test-'));
}

function writeConfig(dir: string, content: string, filename = 'gwen.config.ts'): string {
  const p = path.join(dir, filename);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

const MINIMAL_CONFIG = `
export default {
  engine: { maxEntities: 500, targetFPS: 30, debug: true }
};
`;
