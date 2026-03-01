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
import path from 'node:path';
import { findConfigFile } from './config-parser.js';

export interface PrepareOptions {
  projectDir?: string;
  verbose?: boolean;
}

export interface PrepareResult {
  success: boolean;
  gwenDir: string;
  files: string[];
  errors: string[];
}

// ── Prépare le dossier .gwen/ ─────────────────────────────────────────────────

export async function prepare(options: PrepareOptions = {}): Promise<PrepareResult> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const verbose    = options.verbose ?? false;
  const gwenDir    = path.join(projectDir, '.gwen');
  const result: PrepareResult = { success: false, gwenDir, files: [], errors: [] };

  const log = (msg: string) => { if (verbose) console.log(msg); };

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
  const dtspath = path.join(gwenDir, 'gwen.d.ts');
  const dtsContent = generateDts(projectDir, configPath);
  fs.writeFileSync(dtspath, dtsContent, 'utf-8');
  result.files.push(dtspath);
  log(`[gwen prepare] ✅ ${path.relative(projectDir, dtspath)}`);

  // ── 3. S'assurer que le tsconfig.json du projet étend .gwen/ ───────────────
  ensureProjectTsconfig(projectDir, gwenDir, verbose);

  // ── 4. Ajouter .gwen/ dans .gitignore ──────────────────────────────────────
  ensureGitignore(projectDir);

  result.success = true;
  console.log(`[gwen prepare] ✅ .gwen/ generated (${result.files.length} files)`);
  return result;
}

// ── Génération du tsconfig ────────────────────────────────────────────────────

function generateTsconfig(projectDir: string): object {
  // Détecter si on est dans un monorepo (packages/@gwen/ présent)
  const isMonorepo = fs.existsSync(path.join(projectDir, '..', 'packages'));
  const isPlayground = path.basename(projectDir) === 'playground';

  // Résoudre les alias de packages
  const paths: Record<string, string[]> = {};

  // Dans un monorepo de dev, on pointe vers les sources
  if (isPlayground || isMonorepo) {
    const packagesDir = path.resolve(projectDir, '..', 'packages', '@gwen');
    const packageMap: Record<string, string> = {
      '@gwen/engine-core':      'engine-core/src/index.ts',
      '@gwen/renderer-canvas2d':'renderer-canvas2d/src/index.ts',
      '@gwen/plugin-input':     'plugin-input/src/index.ts',
      '@gwen/plugin-audio':     'plugin-audio/src/index.ts',
      '@gwen/vite-plugin':      'vite-plugin/src/index.ts',
    };

    for (const [pkg, rel] of Object.entries(packageMap)) {
      const abs = path.join(packagesDir, rel);
      if (fs.existsSync(abs)) {
        paths[pkg] = [path.relative(projectDir, abs)];
      }
    }
  }

  return {
    // Ce fichier est généré automatiquement par `gwen prepare`.
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
      // Alias de packages
      ...(Object.keys(paths).length > 0 ? { baseUrl: '..', paths } : {}),
    },
    include: [
      '../src',
      '../*.ts',
      './*.d.ts',
    ],
    exclude: [
      '../node_modules',
      '../dist',
    ],
  };
}

// ── Génération du gwen.d.ts ──────────────────────────────────────────────────

function generateDts(projectDir: string, configPath: string): string {
  const relConfig = path.relative(path.join(projectDir, '.gwen'), configPath)
    .replace(/\\/g, '/').replace(/\.ts$/, '');

  return `/**
 * GWEN — Types globaux auto-générés
 * Généré par \`gwen prepare\` — NE PAS MODIFIER
 * Source : gwen.config.ts
 */

// Re-exporte GwenServices depuis gwen.config pour qu'il soit
// disponible globalement sans import dans tous les fichiers du projet.
export type { GwenServices } from '${relConfig}';

// Variable injectée par le vite-plugin en mode dev/build
declare const __GWEN_VERSION__: string;
declare const __GWEN_DEV__: boolean;
`;
}

// ── S'assurer que tsconfig.json étend .gwen/tsconfig.generated.json ──────────

function ensureProjectTsconfig(projectDir: string, gwenDir: string, verbose: boolean): void {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  const relExtends   = './.gwen/tsconfig.generated.json';
  const log = (msg: string) => { if (verbose) console.log(msg); };

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
  let tsconfig: any;
  try {
    tsconfig = JSON.parse(raw);
  } catch {
    log(`[gwen prepare] ⚠ tsconfig.json is not valid JSON — skipping extends patch`);
    return;
  }

  if (tsconfig.extends !== relExtends) {
    tsconfig.extends = relExtends;
    // Supprimer les champs redondants maintenant couverts par le generated
    const redundant = ['compilerOptions', 'paths', 'baseUrl'];
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

