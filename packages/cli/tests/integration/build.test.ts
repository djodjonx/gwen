/**
 * Integration tests for build operation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { join } from 'pathe';
import { build } from '../../src';
import { makeTmpDir, writeConfig, MINIMAL_CONFIG } from '../utils.js';

describe('build integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return success with valid config in dry-run mode', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');

    const result = await build({
      projectDir: tmpDir,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should use release mode by default', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');

    const result = await build({
      projectDir: tmpDir,
      dryRun: true,
    });

    expect(result.success).toBe(true);
  });

  it('should handle debug mode', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');

    const result = await build({
      projectDir: tmpDir,
      mode: 'debug',
      dryRun: true,
    });

    expect(result.success).toBe(true);
  });

  it('should use custom output directory', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');

    const result = await build({
      projectDir: tmpDir,
      outDir: join(tmpDir, 'custom-dist'),
      dryRun: true,
    });

    expect(result.success).toBe(true);
  });

  it('should return error when config not found', async () => {
    // Don't write config file
    const result = await build({
      projectDir: tmpDir,
      dryRun: true,
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Config loading failed/);
  });

  it('should return error on invalid config', async () => {
    writeConfig(tmpDir, 'export default { engine: { maxEntities: 50 } };', 'gwen.config.ts');

    const result = await build({
      projectDir: tmpDir,
      dryRun: true,
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject plugin-only framework config with migration guidance', async () => {
    writeConfig(
      tmpDir,
      "export default { plugins: [{ name: 'legacy-plugin' }] };",
      'gwen.config.ts',
    );

    const result = await build({
      projectDir: tmpDir,
      dryRun: true,
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Module-first configuration required');
  });

  it('should measure build duration', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');

    const result = await build({
      projectDir: tmpDir,
      dryRun: true,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should include warnings in result', async () => {
    writeConfig(tmpDir, MINIMAL_CONFIG, 'gwen.config.ts');

    const result = await build({
      projectDir: tmpDir,
      dryRun: true,
    });

    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
