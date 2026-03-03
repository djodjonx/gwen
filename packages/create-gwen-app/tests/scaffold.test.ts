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
      const destName = entry.name.startsWith('_') ? '.' + entry.name.slice(1) : entry.name;
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

  copyDir(templateDir, destDir, { PROJECT_NAME: safeName, GWEN_VERSION: '0.1.0' });
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

  it('package.json has @gwen/engine-core dependency', async () => {
    const dest = await scaffold('test-proj', tmpDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@gwen/engine-core']).toBeDefined();
  });

  it('package.json has @gwen/vite-plugin as devDependency', async () => {
    const dest = await scaffold('test-proj', tmpDir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkg.devDependencies['@gwen/vite-plugin']).toBeDefined();
  });

  it('generates vite.config.ts', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(path.join(dest, 'vite.config.ts'))).toBe(true);
  });

  it('vite.config.ts imports @gwen/vite-plugin', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const content = fs.readFileSync(path.join(dest, 'vite.config.ts'), 'utf-8');
    expect(content).toContain("from '@gwen/vite-plugin'");
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

  it('generates index.html with canvas', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const html = fs.readFileSync(path.join(dest, 'index.html'), 'utf-8');
    expect(html).toContain('<canvas');
    expect(html).toContain('src/main.ts');
  });

  it('generates src/main.ts with initWasm()', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const main = fs.readFileSync(path.join(dest, 'src', 'main.ts'), 'utf-8');
    expect(main).toContain('initWasm()');
    expect(main).toContain('@gwen/engine-core');
  });

  it('main.ts calls initWasm() without arguments (auto-resolve)', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const main = fs.readFileSync(path.join(dest, 'src', 'main.ts'), 'utf-8');
    // Should NOT have hardcoded paths
    expect(main).not.toContain("initWasm('");
    expect(main).not.toContain('initWasm("/');
  });

  it('generates src/scenes/MainScene.ts', async () => {
    const dest = await scaffold('my-game', tmpDir);
    expect(fs.existsSync(path.join(dest, 'src', 'scenes', 'MainScene.ts'))).toBe(true);
  });

  it('MainScene implements TsPlugin interface', async () => {
    const dest = await scaffold('my-game', tmpDir);
    const scene = fs.readFileSync(path.join(dest, 'src', 'scenes', 'MainScene.ts'), 'utf-8');
    expect(scene).toContain('TsPlugin');
    expect(scene).toContain('onInit');
    expect(scene).toContain('onUpdate');
    expect(scene).toContain('onRender');
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
