/**
 * @gwen/cli — prepare
 *
 * Génère le dossier .gwen/ depuis gwen.config.ts :
 *
 *   .gwen/
 *     tsconfig.generated.json   ← tsconfig complet pour le projet
 *     gwen.d.ts                 ← types globaux (GwenServices auto-importé, etc.)
 *
 * Identique au pattern Nuxt : `nuxt prepare` → `.nuxt/tsconfig.json`
 *
 * Usage :
 *   gwen prepare          → génère .gwen/
 *   gwen dev / build      → appelle prepare automatiquement avant
 */

import fs from 'node:fs';
import * as path from 'node:path';
import { findConfigFile, parseConfigFile } from './config-parser.js';

/**
 * Options for the prepare command
 */
export interface PrepareOptions {
  /**
   * Project root directory. Defaults to current working directory.
   * Must contain a gwen.config.ts file.
   */
  projectDir?: string;
  /**
   * Enable detailed logging output (includes file paths, operation status).
   * Defaults to false.
   */
  verbose?: boolean;
}

/**
 * Result of prepare operation
 */
export interface PrepareResult {
  /** True if all files were generated successfully */
  success: boolean;
  /** Path to generated .gwen/ directory */
  gwenDir: string;
  /** List of generated file paths */
  files: string[];
  /** List of error messages if generation failed */
  errors: string[];
}

/**
 * Generate the .gwen/ folder from gwen.config.ts
 *
 * Generates TypeScript configuration and type definitions for the project.
 * Creates:
 * - .gwen/tsconfig.generated.json — Complete tsconfig with strict settings
 * - .gwen/gwen.d.ts — Global type definitions (GwenServices, __GWEN_VERSION__, etc.)
 * - .gwen/index.html — Generated HTML entry if none exists
 *
 * Identical to Nuxt pattern: `nuxt prepare` → `.nuxt/tsconfig.json`
 *
 * @param options Configuration options
 * @returns Promise<PrepareResult> with success status, generated files list, and errors
 *
 * @example
 * ```typescript
 * import { prepare } from '@gwen/cli';
 *
 * const result = await prepare({ projectDir: process.cwd(), verbose: true });
 * if (result.success) {
 *   console.log('Generated files:', result.files);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */
export async function prepare(options: PrepareOptions = {}): Promise<PrepareResult> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const verbose = options.verbose ?? false;
  const gwenDir = path.join(projectDir, '.gwen');
  const result: PrepareResult = { success: false, gwenDir, files: [], errors: [] };

  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  // Vérifier que gwen.config.ts existe
  const configPath = findConfigFile(projectDir);
  if (!configPath) {
    result.errors.push(`gwen.config.ts not found in ${projectDir}`);
    return result;
  }

  log(`[gwen prepare] Config: ${configPath}`);
  log(`[gwen prepare] Output: ${gwenDir}`);

  fs.mkdirSync(gwenDir, { recursive: true });

  // ── 1. Générer tsconfig.generated.json ──────────────────────────────────────
  const tsconfigPath = path.join(gwenDir, 'tsconfig.generated.json');
  const tsconfigContent = generateTsconfig(projectDir);
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfigContent, null, 2), 'utf-8');
  result.files.push(tsconfigPath);
  log(`[gwen prepare] ✅ ${path.relative(projectDir, tsconfigPath)}`);

  // ── 2. Générer gwen.d.ts ────────────────────────────────────────────────────
  const typeRefs = collectPluginTypeReferences(projectDir, configPath, verbose);
  const dtspath = path.join(gwenDir, 'gwen.d.ts');
  const dtsContent = generateDts(projectDir, configPath, typeRefs);
  fs.writeFileSync(dtspath, dtsContent, 'utf-8');
  result.files.push(dtspath);
  log(`[gwen prepare] ✅ ${path.relative(projectDir, dtspath)}`);

  // ── 3. Générer index.html (virtuel) ─────────────────────────────────────────
  const htmlPath = path.join(gwenDir, 'index.html');
  const parsed = parseConfigFile(configPath);
  const htmlContent = generateIndexHtml(projectDir, parsed.html);
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  result.files.push(htmlPath);
  log(`[gwen prepare] ✅ ${path.relative(projectDir, htmlPath)}`);

  // ── 4. S'assurer que le tsconfig.json du projet étend .gwen/ ───────────────
  ensureProjectTsconfig(projectDir, gwenDir, verbose);

  // ── 5. Ajouter .gwen/ dans .gitignore ──────────────────────────────────────
  ensureGitignore(projectDir);

  result.success = true;
  console.log(`[gwen prepare] ✅ .gwen/ generated (${result.files.length} files)`);
  return result;
}

// ── Collecte des typeReferences des plugins ───────────────────────────────────

/**
 * Lit les plugins déclarés dans gwen.config.ts, tente d'importer
 * leur `pluginMeta`, et collecte toutes les `typeReferences`.
 *
 * Silencieux si un plugin n'exporte pas de `pluginMeta` — opt-in.
 */
function collectPluginTypeReferences(
  projectDir: string,
  configPath: string,
  verbose: boolean,
): string[] {
  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };
  const parsed = parseConfigFile(configPath);
  const refs = new Set<string>();

  for (const plugin of parsed.plugins) {
    try {
      const typeRefs = readPluginGwenMeta(projectDir, plugin.packageName);
      for (const ref of typeRefs) {
        refs.add(ref);
        log(`[gwen prepare] 📦 ${plugin.packageName} → typeRef: ${ref}`);
      }
    } catch {
      // Plugin sans meta — silencieux
    }
  }

  return Array.from(refs);
}

/**
 * Lit les métadonnées GWEN d'un plugin depuis son package.json.
 *
 * Convention : le plugin déclare un champ "gwen" dans son package.json :
 * ```json
 * {
 *   "gwen": {
 *     "typeReferences": ["@gwen/plugin-html-ui/vite-env"]
 *   }
 * }
 * ```
 *
 * Cette approche est 100% statique, fonctionne avec n'importe quel bundler,
 * et est fiable aussi bien en monorepo qu'en npm publié (seul dist/ disponible).
 *
 * Inspiré du champ "nuxt" de Nuxt modules et "exports" de Vite.
 */
function readPluginGwenMeta(projectDir: string, packageName: string): string[] {
  let dir = projectDir;
  for (let i = 0; i < 5; i++) {
    const pkgJsonPath = path.join(dir, 'node_modules', packageName, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
          gwen?: { typeReferences?: string[] };
        };
        return pkg.gwen?.typeReferences ?? [];
      } catch {
        return [];
      }
    }
    dir = path.dirname(dir);
  }
  return [];
}

// ── Génération du index.html virtuel ──────────────────────────────────────────

function generateIndexHtml(
  projectDir: string,
  options: { title?: string; background?: string },
): string {
  const title = options.title ?? path.basename(projectDir);
  const bg = options.background ?? '#000';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${bg};
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <script type="module" src="/@gwen/entry"></script>
</body>
</html>`;
}

// ── Génération du tsconfig ────────────────────────────────────────────────────

function generateTsconfig(_projectDir: string): object {
  return {
    // Ce fichier est généré automatiquement par \`gwen prepare\`.
    // NE PAS MODIFIER — vos modifications seront écrasées.
    // Modifiez gwen.config.ts à la place.
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      // PAS de "types" avec chemin relatif — gwen.d.ts est inclus via "include"
      // Résolution monorepo : on utilise la condition 'development'
      // définit dans les package.json des packages @gwen/*
      customConditions: ['development'],
    },
    include: ['../src', '../*.ts', './*.d.ts'],
    exclude: ['../node_modules', '../dist'],
  };
}

// ── Génération du gwen.d.ts ──────────────────────────────────────────────────

function generateDts(projectDir: string, configPath: string, typeRefs: string[] = []): string {
  const relConfig = path
    .relative(path.join(projectDir, '.gwen'), configPath)
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '');

  const source = fs.readFileSync(configPath, 'utf-8');
  const exportStyle = detectConfigExportStyle(source);

  const configImport =
    exportStyle.type === 'default'
      ? `import type _cfg from '${relConfig}';`
      : `import type { ${exportStyle.name} as _cfg } from '${relConfig}';`;

  const displayName = exportStyle.type === 'default' ? 'default export' : exportStyle.name;

  // Bloc /// <reference types="..." /> injecté uniquement si des plugins en ont besoin
  const refBlock =
    typeRefs.length > 0
      ? typeRefs.map((r) => `/// <reference types="${r}" />`).join('\n') + '\n\n'
      : '';

  return `/**
 * GWEN — Types globaux auto-générés
 * Généré par \`gwen prepare\` — NE PAS MODIFIER
 * Source : gwen.config.ts
 *
 * GwenDefaultServices est enrichi automatiquement depuis le ${displayName}.
 * Cela rend tous les define* (defineSystem, defineUI, defineScene, definePrefab)
 * automatiquement typés — aucune annotation explicite requise.
 */
${refBlock}import type { GwenConfigServices, EngineAPI } from '@gwen/engine-core';
${configImport}

type _GwenServices = GwenConfigServices<typeof _cfg>;

declare global {
  /**
   * Enrichit GwenDefaultServices avec les services du projet.
   * Utilisé comme default générique par EngineAPI, defineUI, etc.
   * Aucune annotation n'est nécessaire dans les define* :
   *
   * @example
   * export const PlayerSystem = defineSystem({
   *   name: 'PlayerSystem',
   *   onUpdate(api, dt) {
   *     const kb = api.services.get('keyboard'); // ✅ KeyboardInput — sans annotation
   *   }
   * });
   *
   * export const PlayerUI = defineUI({
   *   name: 'PlayerUI',
   *   render(api, id) {
   *     const { ctx } = api.services.get('renderer'); // ✅ Canvas2DRenderer — sans generic
   *   }
   * });
   */
  interface GwenDefaultServices extends _GwenServices {}

  /**
   * Alias de commodité — équivalent à EngineAPI<GwenDefaultServices>.
   * Utile pour annoter explicitement (plugins, bibliothèques tierces).
   *
   * @example
   * onInit(api: GwenAPI) { ... }
   */
  type GwenAPI = EngineAPI<GwenDefaultServices>;

  /**
   * @deprecated Utiliser GwenAPI ou laisser TypeScript inférer automatiquement.
   * Conservé pour la rétrocompatibilité.
   */
  type GwenServices = _GwenServices;

  const __GWEN_VERSION__: string;
  const __GWEN_DEV__: boolean;
}


export {};
`;
}

/**
 * Détecte le style d'export de defineConfig() dans gwen.config.ts.
 *
 *   export default defineConfig(...)          → { type: 'default' }
 *   export const gwenConfig = defineConfig(…) → { type: 'named', name: 'gwenConfig' }
 */
function detectConfigExportStyle(
  source: string,
): { type: 'default' } | { type: 'named'; name: string } {
  if (/export\s+default\s+defineConfig\s*\(/.test(source)) return { type: 'default' };
  const match = source.match(/export\s+const\s+(\w+)\s*=\s*defineConfig\s*\(/);
  if (match) return { type: 'named', name: match[1] };
  return { type: 'default' }; // fallback
}

// ── S'assurer que tsconfig.json étend .gwen/tsconfig.generated.json ──────────

function ensureProjectTsconfig(projectDir: string, gwenDir: string, verbose: boolean): void {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  const relExtends = './.gwen/tsconfig.generated.json';
  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  if (!fs.existsSync(tsconfigPath)) {
    // Créer un tsconfig.json minimal qui étend le généré
    const minimal = {
      extends: relExtends,
      compilerOptions: {},
      include: ['src', '*.ts'],
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(minimal, null, 2), 'utf-8');
    log(`[gwen prepare] ✅ tsconfig.json created (extends .gwen/)`);
    return;
  }

  // Lire le tsconfig existant et s'assurer qu'il étend .gwen/
  const raw = fs.readFileSync(tsconfigPath, 'utf-8');

  interface TsConfig {
    extends?: string;
    compilerOptions?: {
      paths?: Record<string, string[]>;
      baseUrl?: string;
      target?: string;
      [key: string]: unknown;
    };
    include?: string[];
    exclude?: string[];
    [key: string]: unknown;
  }

  let tsconfig: TsConfig;
  try {
    tsconfig = JSON.parse(raw) as TsConfig;
  } catch {
    log(`[gwen prepare] ⚠ tsconfig.json is not valid JSON — skipping extends patch`);
    return;
  }

  if (tsconfig.extends !== relExtends) {
    tsconfig.extends = relExtends;
    // Supprimer les champs redondants maintenant couverts par le generated
    // On garde compilerOptions mais on nettoie les paths/baseUrl qui sont dans le generated
    if (tsconfig.compilerOptions) {
      delete tsconfig.compilerOptions.paths;
      delete tsconfig.compilerOptions.baseUrl;
      delete tsconfig.compilerOptions.target;
      delete tsconfig.compilerOptions.module;
      delete tsconfig.compilerOptions.moduleResolution;
      // Si compilerOptions est vide, on le retire
      if (Object.keys(tsconfig.compilerOptions).length === 0) {
        delete tsconfig.compilerOptions;
      }
    }
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');
    log(`[gwen prepare] ✅ tsconfig.json patched to extend .gwen/tsconfig.generated.json`);
  }
}

// ── .gitignore ────────────────────────────────────────────────────────────────

function ensureGitignore(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const entry = '.gwen/';

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}\nnode_modules/\ndist/\n`, 'utf-8');
    return;
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  if (!content.includes(entry)) {
    fs.appendFileSync(gitignorePath, `\n# GWEN generated\n${entry}\n`);
  }
}
