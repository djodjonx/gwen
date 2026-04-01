/**
 * Unit tests for `detectPackageManager`
 *
 * Tests that the utility correctly identifies the package manager from lock files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectPackageManager } from '../../dist/utils/package-manager.js';

/** Creates an isolated temp directory for each test. */
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gwen-pm-test-'));
}

describe('detectPackageManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects pnpm when pnpm-lock.yaml is present', async () => {
    await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '', 'utf8');
    expect(detectPackageManager(tmpDir)).toBe('pnpm');
  });

  it('detects yarn when yarn.lock is present', async () => {
    await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '', 'utf8');
    expect(detectPackageManager(tmpDir)).toBe('yarn');
  });

  it('detects bun when bun.lockb is present', async () => {
    await fs.writeFile(path.join(tmpDir, 'bun.lockb'), '', 'utf8');
    expect(detectPackageManager(tmpDir)).toBe('bun');
  });

  it('falls back to npm when no lock file is present', async () => {
    expect(detectPackageManager(tmpDir)).toBe('npm');
  });

  it('returns a known PackageManager string', async () => {
    const valid = ['pnpm', 'npm', 'yarn', 'bun'];
    const result = detectPackageManager(tmpDir);
    expect(valid).toContain(result);
  });

  it('prefers pnpm over yarn when both lock files exist', async () => {
    await fs.writeFile(path.join(tmpDir, 'pnpm-lock.yaml'), '', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '', 'utf8');
    expect(detectPackageManager(tmpDir)).toBe('pnpm');
  });
});
