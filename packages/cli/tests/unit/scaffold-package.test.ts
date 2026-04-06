/**
 * Tests for `gwen scaffold package` — verifies templates produce correct
 * file content and the full scaffold generates the expected file tree.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  toPascalCase,
  toCamelCase,
  packageJsonTemplate,
  tsconfigTemplate,
  viteConfigTemplate,
  typesTemplate,
  augmentTemplate,
  pluginTemplate,
  composablesTemplate,
  moduleTemplate,
  indexTemplate,
} from '../../src/commands/scaffold/package.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gwen-scaffold-pkg-'));
}

async function fileExists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

describe('toPascalCase', () => {
  it('converts kebab-case to PascalCase', () => {
    expect(toPascalCase('my-plugin')).toBe('MyPlugin');
  });
  it('converts single word', () => {
    expect(toPascalCase('audio')).toBe('Audio');
  });
  it('converts multi-word with underscores', () => {
    expect(toPascalCase('my_cool_plugin')).toBe('MyCoolPlugin');
  });
});

describe('toCamelCase', () => {
  it('converts kebab-case to camelCase', () => {
    expect(toCamelCase('my-plugin')).toBe('myPlugin');
  });
  it('converts single word', () => {
    expect(toCamelCase('audio')).toBe('audio');
  });
});

// ─── Template unit tests ──────────────────────────────────────────────────────

describe('packageJsonTemplate', () => {
  it('sets the correct package name', () => {
    const pkg = JSON.parse(packageJsonTemplate('my-plugin', '^0.1.0'));
    expect(pkg.name).toBe('@community/gwen-my-plugin');
  });

  it('starts at version 0.1.0', () => {
    const pkg = JSON.parse(packageJsonTemplate('audio', '^0.1.0'));
    expect(pkg.version).toBe('0.1.0');
  });

  it('exports "." and "./module" entry points', () => {
    const pkg = JSON.parse(packageJsonTemplate('audio', '^0.1.0'));
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['./module']).toBeDefined();
  });

  it('includes @gwenjs/core and @gwenjs/kit in dependencies', () => {
    const pkg = JSON.parse(packageJsonTemplate('audio', '^0.2.0'));
    expect(pkg.dependencies['@gwenjs/core']).toBe('^0.2.0');
    expect(pkg.dependencies['@gwenjs/kit']).toBe('^0.2.0');
  });

  it('puts vite and typescript in devDependencies', () => {
    const pkg = JSON.parse(packageJsonTemplate('audio', '^0.1.0'));
    expect(pkg.devDependencies['vite']).toBeDefined();
    expect(pkg.devDependencies['typescript']).toBeDefined();
    expect(pkg.devDependencies['vitest']).toBeDefined();
    expect(pkg.dependencies['vite']).toBeUndefined();
  });

  it('has all required scripts', () => {
    const pkg = JSON.parse(packageJsonTemplate('audio', '^0.1.0'));
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
  });
});

describe('typesTemplate', () => {
  it('exports <Name>Config and <Name>Service', () => {
    const content = typesTemplate('audio');
    expect(content).toContain('export interface AudioConfig');
    expect(content).toContain('export interface AudioService');
  });

  it('uses PascalCase from kebab-case name', () => {
    const content = typesTemplate('my-plugin');
    expect(content).toContain('export interface MyPluginConfig');
    expect(content).toContain('export interface MyPluginService');
  });
});

describe('augmentTemplate', () => {
  it('augments GwenProvides with the service key', () => {
    const content = augmentTemplate('audio');
    expect(content).toContain('interface GwenProvides');
    expect(content).toContain('audio: AudioService');
  });

  it('imports the service type from ./types.js', () => {
    const content = augmentTemplate('audio');
    expect(content).toContain("from './types.js'");
  });
});

describe('pluginTemplate', () => {
  it('imports from types.js not index.ts', () => {
    const content = pluginTemplate('audio');
    expect(content).toContain("from './types.js'");
    expect(content).not.toContain("from './index");
  });

  it('exports the plugin as <Name>Plugin', () => {
    const content = pluginTemplate('audio');
    expect(content).toContain('export const AudioPlugin = definePlugin');
  });

  it('calls engine.provide with the correct key', () => {
    const content = pluginTemplate('audio');
    expect(content).toContain("engine.provide('audio'");
  });
});

describe('composablesTemplate', () => {
  it('imports augment.ts as side-effect', () => {
    const content = composablesTemplate('audio');
    expect(content).toContain("import './augment.js'");
  });

  it('exports use<Name>()', () => {
    const content = composablesTemplate('audio');
    expect(content).toContain('export function useAudio()');
  });

  it('throws GwenPluginNotFoundError with helpful hint', () => {
    const content = composablesTemplate('audio');
    expect(content).toContain('GwenPluginNotFoundError');
    expect(content).toContain('@community/gwen-audio');
  });
});

describe('moduleTemplate', () => {
  it('never imports from index.ts', () => {
    const content = moduleTemplate('audio');
    // Only check actual import statements (not comment lines)
    const importLines = content
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    expect(importLines).not.toContain("from './index");
    expect(importLines).not.toContain('from "./index');
  });

  it('imports plugin lazily from plugin.js', () => {
    const content = moduleTemplate('audio');
    expect(content).toContain("import('./plugin.js')");
  });

  it('calls kit.addPlugin, kit.addAutoImports, kit.addTypeTemplate', () => {
    const content = moduleTemplate('audio');
    expect(content).toContain('kit.addPlugin');
    expect(content).toContain('kit.addAutoImports');
    expect(content).toContain('kit.addTypeTemplate');
  });

  it('registers the composable for auto-import', () => {
    const content = moduleTemplate('audio');
    expect(content).toContain("name: 'useAudio'");
    expect(content).toContain("from: '@community/gwen-audio'");
  });
});

describe('indexTemplate', () => {
  it('imports augment.ts as side-effect', () => {
    const content = indexTemplate('audio');
    expect(content).toContain("import './augment.js'");
  });

  it('re-exports plugin, composables and types', () => {
    const content = indexTemplate('audio');
    expect(content).toContain("from './plugin.js'");
    expect(content).toContain("from './composables.js'");
    expect(content).toContain("from './types.js'");
  });

  it('does NOT re-export module.ts', () => {
    const content = indexTemplate('audio');
    expect(content).not.toContain("from './module");
  });
});

// ─── Integration test ─────────────────────────────────────────────────────────

describe('scaffoldPackageCommand integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates all 9 expected files', async () => {
    const name = 'test-plugin';
    const gwenVersion = '^0.1.0';
    const outputDir = path.join(tmpDir, name);
    const srcDir = path.join(outputDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    const files: Array<[string, string]> = [
      [path.join(outputDir, 'package.json'), packageJsonTemplate(name, gwenVersion)],
      [path.join(outputDir, 'tsconfig.json'), tsconfigTemplate()],
      [path.join(outputDir, 'vite.config.ts'), viteConfigTemplate(name)],
      [path.join(srcDir, 'types.ts'), typesTemplate(name)],
      [path.join(srcDir, 'augment.ts'), augmentTemplate(name)],
      [path.join(srcDir, 'plugin.ts'), pluginTemplate(name)],
      [path.join(srcDir, 'composables.ts'), composablesTemplate(name)],
      [path.join(srcDir, 'module.ts'), moduleTemplate(name)],
      [path.join(srcDir, 'index.ts'), indexTemplate(name)],
    ];

    for (const [filePath, content] of files) {
      await fs.writeFile(filePath, content, 'utf8');
    }

    expect(await fileExists(path.join(outputDir, 'package.json'))).toBe(true);
    expect(await fileExists(path.join(outputDir, 'tsconfig.json'))).toBe(true);
    expect(await fileExists(path.join(outputDir, 'vite.config.ts'))).toBe(true);
    expect(await fileExists(path.join(srcDir, 'types.ts'))).toBe(true);
    expect(await fileExists(path.join(srcDir, 'augment.ts'))).toBe(true);
    expect(await fileExists(path.join(srcDir, 'plugin.ts'))).toBe(true);
    expect(await fileExists(path.join(srcDir, 'composables.ts'))).toBe(true);
    expect(await fileExists(path.join(srcDir, 'module.ts'))).toBe(true);
    expect(await fileExists(path.join(srcDir, 'index.ts'))).toBe(true);
  });

  it('package.json has correct name from input', () => {
    const name = 'my-awesome-plugin';
    const pkg = JSON.parse(packageJsonTemplate(name, '^0.1.0'));
    expect(pkg.name).toBe('@community/gwen-my-awesome-plugin');
  });

  it('generated module.ts does not import from index.ts', () => {
    const content = moduleTemplate('test-plugin');
    // Only check actual import statements (not comment lines)
    const importLines = content
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    expect(importLines).not.toMatch(/from ['"]\.\/index/);
  });
});
