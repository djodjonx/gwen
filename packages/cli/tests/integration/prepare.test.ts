import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { join } from 'pathe';
import { prepare } from '../../src';
import { makeTmpDir, writeConfig } from '../utils.js';

const MODULES_CONFIG = `
export default {
  engine: { maxEntities: 1000, targetFPS: 60 },
  modules: [],
};
`;

describe('prepare integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .gwen/types/ directory', async () => {
    writeConfig(tmpDir, MODULES_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });
    expect(result.success).toBe(true);
    expect(fs.existsSync(join(tmpDir, '.gwen', 'types'))).toBe(true);
  });

  it('generates auto-imports.d.ts', async () => {
    writeConfig(tmpDir, MODULES_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });
    expect(result.success).toBe(true);
    expect(fs.existsSync(join(tmpDir, '.gwen', 'types', 'auto-imports.d.ts'))).toBe(true);
  });

  it('generates env.d.ts', async () => {
    writeConfig(tmpDir, MODULES_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });
    expect(result.success).toBe(true);
    expect(fs.existsSync(join(tmpDir, '.gwen', 'types', 'env.d.ts'))).toBe(true);
  });

  it('generates .gwen/tsconfig.json with correct shape', async () => {
    writeConfig(tmpDir, MODULES_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });
    expect(result.success).toBe(true);
    const tsconfigPath = join(tmpDir, '.gwen', 'tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    expect(content).toHaveProperty('compilerOptions');
    expect(content.compilerOptions).toMatchObject({ noEmit: true });
    expect(content.include).toEqual(expect.arrayContaining([expect.stringContaining('types')]));
  });

  it('patches tsconfig.json to extend .gwen/tsconfig.json', async () => {
    writeConfig(tmpDir, MODULES_CONFIG, 'gwen.config.ts');
    await prepare({ projectDir: tmpDir });
    const tsconfig = JSON.parse(fs.readFileSync(join(tmpDir, 'tsconfig.json'), 'utf-8'));
    expect(tsconfig.extends).toBe('./.gwen/tsconfig.json');
  });

  it('adds .gwen/ to .gitignore', async () => {
    writeConfig(tmpDir, MODULES_CONFIG, 'gwen.config.ts');
    await prepare({ projectDir: tmpDir });
    const content = fs.readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.gwen/');
  });

  it('fails gracefully when config not found', async () => {
    const result = await prepare({ projectDir: tmpDir });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Config/i);
  });

  it('generates baseline files even with no modules', async () => {
    writeConfig(tmpDir, MODULES_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });
    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });
});
