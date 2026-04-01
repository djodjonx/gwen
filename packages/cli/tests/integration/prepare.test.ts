/**
 * Integration tests for prepare operation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { join } from 'pathe';
import { prepare } from '../../src';
import { makeTmpDir, writeConfig, MINIMAL_CONFIG } from '../utils.js';

describe('prepare integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create .gwen directory', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });

    expect(result.success).toBe(true);
    expect(fs.existsSync(join(tmpDir, '.gwen'))).toBe(true);
  });

  it('should generate tsconfig.generated.json', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });

    expect(result.success).toBe(true);
    const tsconfigPath = join(tmpDir, '.gwen', 'tsconfig.generated.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);

    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
  });

  it('should generate gwen.d.ts', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });

    expect(result.success).toBe(true);
    const dtsPath = join(tmpDir, '.gwen', 'gwen.d.ts');
    expect(fs.existsSync(dtsPath)).toBe(true);

    const content = fs.readFileSync(dtsPath, 'utf-8');
    expect(content).toContain('GwenDefaultServices');
    expect(content).toContain('GwenAPI');
    expect(content).toContain('declare global');
  });

  it('should generate index.html', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });

    expect(result.success).toBe(true);
    const htmlPath = join(tmpDir, '.gwen', 'index.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const content = fs.readFileSync(htmlPath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('/@gwenengine/gwen-entry');
  });

  it('should create or patch tsconfig.json', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');
    await prepare({ projectDir: tmpDir });

    const tsconfigPath = join(tmpDir, 'tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);

    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.extends).toBe('./.gwen/tsconfig.generated.json');
  });

  it('should add .gwen/ to .gitignore', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');
    await prepare({ projectDir: tmpDir });

    const gitignorePath = join(tmpDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.gwen/');
  });

  it('should return list of generated files', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');
    const result = await prepare({ projectDir: tmpDir });

    expect(result.files.length).toBeGreaterThanOrEqual(3);
    expect(result.files.some((f: string) => f.endsWith('tsconfig.generated.json'))).toBe(true);
    expect(result.files.some((f: string) => f.endsWith('gwen.d.ts'))).toBe(true);
    expect(result.files.some((f: string) => f.endsWith('index.html'))).toBe(true);
  });

  it('should fail gracefully when config not found', async () => {
    // Don't write a config file
    const result = await prepare({ projectDir: tmpDir });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Config error/);
  });
});
