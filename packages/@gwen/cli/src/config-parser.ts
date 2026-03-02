/**
 * @gwen/cli — Parser de engine.config.ts
 *
 * Lit le fichier de config du projet et en extrait :
 * - les plugins déclarés (type: 'ts' | 'wasm')
 * - la configuration maxEntities / targetFPS
 * - les assets à copier
 *
 * Le parser est intentionnellement statique (regex + AST lite) pour ne
 * pas exécuter le fichier de config (qui importe @gwen/engine-core, etc.).
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngineConfigParsed {
  /** Chemin absolu du fichier de config trouvé */
  configPath: string;
  /** Configuration engine détectée */
  engine: {
    maxEntities: number;
    targetFPS: number;
    debug: boolean;
  };
  /** Plugins importés dans le fichier de config */
  plugins: PluginInfo[];
  /** Scènes déclarées (noms extraits des constructeurs) */
  scenes: string[];
  /** Options du bloc HTML (titre et background) */
  html: {
    title?: string;
    background?: string;
  };
  /** Chemin du crate Rust si détecté (contient Cargo.toml) */
  rustCratePath: string | null;
}

export interface PluginInfo {
  /** Nom du package importé */
  packageName: string;
  /** Symbole importé (ex: 'InputPlugin') */
  symbolName: string;
  /** 'ts' pour les plugins TypeScript, 'wasm' pour les plugins Rust/WASM */
  type: 'ts' | 'wasm';
}

// Packages connus comme plugins WASM Rust
const KNOWN_WASM_PACKAGES = new Set(['@gwen/plugin-physics2d', '@gwen/plugin-rapier']);

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Cherche engine.config.ts dans le dossier courant et ses parents.
 */
export function findConfigFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, 'engine.config.ts');
    if (fs.existsSync(candidate)) return candidate;
    // Also check gwen.config.ts
    const alt = path.join(dir, 'gwen.config.ts');
    if (fs.existsSync(alt)) return alt;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Parse un fichier engine.config.ts de façon statique.
 * N'exécute pas le fichier — analyse le texte source uniquement.
 */
export function parseConfigFile(configPath: string): EngineConfigParsed {
  const source = fs.readFileSync(configPath, 'utf-8');
  const dir = path.dirname(configPath);

  return {
    configPath,
    engine: extractEngineConfig(source),
    plugins: extractPlugins(source),
    scenes: extractScenes(source),
    html: extractHtmlConfig(source),
    rustCratePath: findRustCrate(dir),
  };
}

// ── Extracteurs ───────────────────────────────────────────────────────────────

function extractEngineConfig(source: string): EngineConfigParsed['engine'] {
  const config: EngineConfigParsed['engine'] = {
    maxEntities: 10_000,
    targetFPS: 60,
    debug: false,
  };

  const maxMatch = source.match(/maxEntities\s*:\s*(\d+)/);
  if (maxMatch) config.maxEntities = parseInt(maxMatch[1], 10);

  const fpsMatch = source.match(/targetFPS\s*:\s*(\d+)/);
  if (fpsMatch) config.targetFPS = parseInt(fpsMatch[1], 10);

  const debugMatch = source.match(/debug\s*:\s*(true|false)/);
  if (debugMatch) config.debug = debugMatch[1] === 'true';

  return config;
}

function extractHtmlConfig(source: string): EngineConfigParsed['html'] {
  const config: EngineConfigParsed['html'] = {};

  const htmlBlockMatch = source.match(/html\s*:\s*\{([^}]*)\}/s);
  if (htmlBlockMatch) {
    const block = htmlBlockMatch[1];
    const titleMatch = block.match(/title\s*:\s*['"`]([^'"`]+)['"`]/);
    if (titleMatch) config.title = titleMatch[1];

    const bgMatch = block.match(/background\s*:\s*['"`]([^'"`]+)['"`]/);
    if (bgMatch) config.background = bgMatch[1];
  }

  return config;
}

function extractPlugins(source: string): PluginInfo[] {
  const plugins: PluginInfo[] = [];
  const seen = new Set<string>();

  // Match: import { Foo, Bar } from '@gwen/plugin-xxx'
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"](@gwen\/[^'"]+)['"]/g;
  let m: RegExpExecArray | null;

  while ((m = importRe.exec(source)) !== null) {
    const symbols = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const pkg = m[2];

    for (const sym of symbols) {
      const key = `${pkg}:${sym}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Only include symbols that look like plugins (PascalCase + Plugin suffix, or known patterns)
      if (/Plugin$|Renderer$|System$/.test(sym)) {
        plugins.push({
          packageName: pkg,
          symbolName: sym,
          type: KNOWN_WASM_PACKAGES.has(pkg) ? 'wasm' : 'ts',
        });
      }
    }
  }

  return plugins;
}

function extractScenes(source: string): string[] {
  const scenes: string[] = [];
  // Match: scenes.register('GameScene', ...) or loadScene('GameScene')
  const re = /(?:register|loadScene)\s*\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (!scenes.includes(m[1])) scenes.push(m[1]);
  }
  return scenes;
}

function findRustCrate(projectDir: string): string | null {
  // Look for Cargo.toml in parent dirs (up to 3 levels)
  let dir = projectDir;
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}
