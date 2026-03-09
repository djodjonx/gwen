import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'index.js');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Importe et exécute la logique de scaffold directement (sans spawn). */
async function scaffold(projectName: string, destBase: string): Promise<string> {
  const safeName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '');
  const destDir = path.join(destBase, safeName);
  const templateDir = path.join(TEMPLATES_DIR, 'default');

  function copyDir(src: string, dest: string, vars: Record<string, string>) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);

      // Sync with CLI logic in bin/index.js
      const destName = entry.name.startsWith('__')
        ? entry.name.slice(2)
        : entry.name.startsWith('_')
          ? '.' + entry.name.slice(1)
          : entry.name;

      const destPath = path.join(dest, destName);
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath, vars);
      } else {
        let content = fs.readFileSync(srcPath, 'utf-8');
        for (const [k, v] of Object.entries(vars)) content = content.replaceAll(`{{${k}}}`, v);
        fs.writeFileSync(destPath, content, 'utf-8');
      }
    }
  }

  copyDir(templateDir, destDir, {
    PROJECT_NAME: safeName,
    GWEN_ENGINE_CORE_VERSION: '0.3.1',
    GWEN_KIT_VERSION: '0.3.1',
    GWEN_PLUGIN_AUDIO_VERSION: '0.3.1',
    GWEN_PLUGIN_INPUT_VERSION: '0.3.1',
    GWEN_RENDERER_CANVAS2D_VERSION: '0.3.1',
    GWEN_CLI_VERSION: '0.3.1',
    GWEN_VITE_PLUGIN_VERSION: '0.1.1',
  });
  return destDir;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('create-gwen-app scaffold', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwen-scaffold-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the project directory', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(dest)).toBe(true);
  });

  it('generates package.json with correct project name', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-game');
  });

  it('package.json has @djodjonx/gwen-engine-core dependency', async () => {
    const dest = await scaffold('test-proj', tmpDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@djodjonx/gwen-engine-core']).toBeDefined();
  });

  it('package.json has @djodjonx/gwen-vite-plugin as devDependency', async () => {
    const dest = await scaffold('test-proj', tmpDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkg.devDependencies['@djodjonx/gwen-vite-plugin']).toBeDefined();
  });

  it('package.json has oxlint as devDependency', async () => {
    const dest = await scaffold('test-proj', tmpDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkg.devDependencies.oxlint).toBeDefined();
  });

  it('generates gwen.config.ts', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(path.join(dest, 'gwen.config.ts'))).toBe(true);
  });

  it('gwen.config.ts uses defineConfig', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const content = fs.readFileSync(path.join(dest, 'gwen.config.ts'), 'utf-8');
    expect(content).toContain('defineConfig');
  });

  it('generates src/scenes/MainScene.ts', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(path.join(dest, 'src', 'scenes', 'MainScene.ts'))).toBe(true);
  });

  it('MainScene uses defineScene from @djodjonx/gwen-engine-core', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const scene = fs.readFileSync(path.join(dest, 'src', 'scenes', 'MainScene.ts'), 'utf-8');
    expect(scene).toContain('defineScene');
    expect(scene).toContain('@djodjonx/gwen-engine-core');
    expect(scene).toContain('onEnter');
    expect(scene).toContain('onExit');
  });

  it('generates src/components/index.ts with defineComponent', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const comp = fs.readFileSync(path.join(dest, 'src', 'components', 'index.ts'), 'utf-8');
    expect(comp).toContain('defineComponent');
    expect(comp).toContain('Position');
  });

  it('generates tsconfig.json', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(path.join(dest, 'tsconfig.json'))).toBe(true);
  });

  it('generates README.md with project name', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const readme = fs.readFileSync(path.join(dest, 'README.md'), 'utf-8');
    expect(readme).toContain('my-game');
  });

  it('generates .gitignore (from _gitignore)', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(path.join(dest, '.gitignore'))).toBe(true);
  });

  it('generates oxlint.json (from __oxlint.json)', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(path.join(dest, 'oxlint.json'))).toBe(true);
  });

  it('sanitizes project name to kebab-case', async () => {
    const dest = await scaffold('My Awesome Game!', tmpDir);
    const basename = path.basename(dest);
    // trailing punctuation is stripped → no trailing dash
    expect(basename).toBe('my-awesome-game');
    // package.json also sanitized
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkg.name).toMatch(/^[a-z0-9-]+$/);
  });

  it('replaces {{PROJECT_NAME}} in all files', async () => {
    const dest = await scaffold('hello-world', tmpDir);
    const readme = fs.readFileSync(path.join(dest, 'README.md'), 'utf-8');
    expect(readme).not.toContain('{{PROJECT_NAME}}');
    expect(readme).toContain('hello-world');
  });

  it('does not include rust or wasm-pack instructions', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const readme = fs.readFileSync(path.join(dest, 'README.md'), 'utf-8');
    // User should not need Rust
    expect(readme.toLowerCase()).not.toContain('wasm-pack');
    expect(readme.toLowerCase()).not.toContain('cargo install');
  });

  it('template bin file exists', () => {
    expect(fs.existsSync(BIN)).toBe(true);
  });

  it('templates/default directory exists', () => {
    expect(fs.existsSync(path.join(TEMPLATES_DIR, 'default'))).toBe(true);
  });
});
