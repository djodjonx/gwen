/**
 * Unit tests for `appendModuleToConfig`
 *
 * Tests the config-writer utility that appends module entries to gwen.config.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appendModuleToConfig } from '../../dist/packages/cli/src/utils/config-writer.js';

/** Creates an isolated temp directory for each test. */
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gwen-test-'));
}

describe('appendModuleToConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appends a module to an empty modules array', async () => {
    const configPath = path.join(tmpDir, 'gwen.config.ts');
    await fs.writeFile(
      configPath,
      `import { defineConfig } from '@gwenjs/app'\nexport default defineConfig({ modules: [] })\n`,
      'utf8',
    );

    await appendModuleToConfig('@gwenjs/physics', { configPath });

    const content = await fs.readFile(configPath, 'utf8');
    expect(content).toContain('@gwenjs/physics');
    expect(content).toContain('modules:');
  });

  it('does not duplicate a module already registered', async () => {
    const configPath = path.join(tmpDir, 'gwen.config.ts');
    await fs.writeFile(
      configPath,
      `import { defineConfig } from '@gwenjs/app'\nexport default defineConfig({ modules: ['@gwenjs/physics'] })\n`,
      'utf8',
    );

    await appendModuleToConfig('@gwenjs/physics', { configPath });

    const content = await fs.readFile(configPath, 'utf8');
    // Should appear exactly once.
    const occurrences = content.split('@gwenjs/physics').length - 1;
    expect(occurrences).toBe(1);
  });

  it('throws when the config file does not exist', async () => {
    const configPath = path.join(tmpDir, 'nonexistent.ts');
    await expect(appendModuleToConfig('@gwenjs/audio', { configPath })).rejects.toThrow(
      '[GWEN:ConfigWriter]',
    );
  });

  it('throws when the modules array marker is missing', async () => {
    const configPath = path.join(tmpDir, 'gwen.config.ts');
    await fs.writeFile(configPath, `export default {}\n`, 'utf8');

    await expect(appendModuleToConfig('@gwenjs/audio', { configPath })).rejects.toThrow(
      '[GWEN:ConfigWriter]',
    );
  });

  it('appends multiple different modules independently', async () => {
    const configPath = path.join(tmpDir, 'gwen.config.ts');
    await fs.writeFile(
      configPath,
      `import { defineConfig } from '@gwenjs/app'\nexport default defineConfig({ modules: [] })\n`,
      'utf8',
    );

    await appendModuleToConfig('@gwenjs/physics', { configPath });
    await appendModuleToConfig('@gwenjs/audio', { configPath });

    const content = await fs.readFile(configPath, 'utf8');
    expect(content).toContain('@gwenjs/physics');
    expect(content).toContain('@gwenjs/audio');
  });
});
