/**
 * @gwen/cli — Builder
 *
 * Orchestre le build complet d'un projet Gwen :
 *  1. Parse engine.config.ts / gwen.config.ts
 *  2a. Si Cargo.toml présent → compile via wasm-pack build
 *  2b. Sinon → copie les artefacts pré-compilés depuis @gwen/engine-core/wasm/
 *  3. Génère un manifeste JSON pour le runtime loader
 *
 * Usage programmatique :
 *   import { build } from '@gwen/cli';
 *   await build({ projectDir: process.cwd() });
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findConfigFile, parseConfigFile, type EngineConfigParsed } from './config-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuildOptions {
  /** Répertoire racine du projet (défaut: process.cwd()) */
  projectDir?: string;
  /** Répertoire de sortie (défaut: <projectDir>/dist) */
  outDir?: string;
  /** Mode release (opt-level=z, lto) ou debug */
  mode?: 'release' | 'debug';
  /** Afficher les logs détaillés */
  verbose?: boolean;
  /**
   * Si true, ne lance pas wasm-pack et ne copie pas les artefacts.
   * Utile pour les tests unitaires du CLI.
   */
  dryRun?: boolean;
}

export interface BuildResult {
  success: boolean;
  configPath: string | null;
  wasmBuilt: boolean;
  wasmOutputDir: string | null;
  manifestPath: string | null;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

export interface WasmManifest {
  version: string;
  builtAt: string;
  engine: EngineConfigParsed['engine'];
  plugins: Array<{
    name: string;
    type: 'ts' | 'wasm';
    wasmPath?: string;
    jsPath?: string;
  }>;
}

// ── Build principal ───────────────────────────────────────────────────────────

export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const start = Date.now();
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const outDir = path.resolve(options.outDir ?? path.join(projectDir, 'dist'));
  const mode = options.mode ?? 'release';
  const verbose = options.verbose ?? false;
  const dryRun = options.dryRun ?? false;

  const result: BuildResult = {
    success: false,
    configPath: null,
    wasmBuilt: false,
    wasmOutputDir: null,
    manifestPath: null,
    errors: [],
    warnings: [],
    durationMs: 0,
  };

  log(verbose, `[gwen build] Project: ${projectDir}`);
  log(verbose, `[gwen build] Output:  ${outDir}`);
  log(verbose, `[gwen build] Mode:    ${mode}`);

  // ── Step 1: Parse engine.config.ts ──────────────────────────────────────────
  const configPath = findConfigFile(projectDir);
  if (!configPath) {
    result.errors.push(
      `No engine.config.ts or gwen.config.ts found starting from: ${projectDir}`
    );
    result.durationMs = Date.now() - start;
    return result;
  }

  result.configPath = configPath;
  log(verbose, `[gwen build] Config:  ${configPath}`);

  let parsed: EngineConfigParsed;
  try {
    parsed = parseConfigFile(configPath);
  } catch (err) {
    result.errors.push(`Failed to parse config: ${err}`);
    result.durationMs = Date.now() - start;
    return result;
  }

  log(verbose, `[gwen build] Engine: maxEntities=${parsed.engine.maxEntities}, fps=${parsed.engine.targetFPS}`);
  log(verbose, `[gwen build] Plugins: ${parsed.plugins.map(p => p.symbolName).join(', ') || 'none'}`);

  // ── Step 2: WASM — compile ou copie ─────────────────────────────────────────
  const wasmOutDir = path.join(outDir, 'wasm');

  if (dryRun) {
    // Mode test — on simule sans toucher au disque
    log(verbose, `[gwen build] [dry-run] Skipping WASM step`);
    result.wasmBuilt = true;
    result.wasmOutputDir = wasmOutDir;
  } else if (parsed.rustCratePath) {
    // ── 2a. Projet avec crate Rust custom → wasm-pack build ────────────────
    log(verbose, `[gwen build] Rust crate detected: ${parsed.rustCratePath}`);
    const wasmBuildResult = buildWasmFromCrate(parsed.rustCratePath, wasmOutDir, mode, verbose);
    if (!wasmBuildResult.success) {
      result.errors.push(...wasmBuildResult.errors);
      result.warnings.push(...wasmBuildResult.warnings);
      result.warnings.push('WASM build failed — manifest will be generated without WASM artifacts');
    } else {
      result.wasmBuilt = true;
      result.wasmOutputDir = wasmOutDir;
      log(verbose, `[gwen build] ✅ WASM built → ${wasmOutDir}`);
    }
  } else {
    // ── 2b. Projet standard → copie les artefacts pré-compilés du package ──
    log(verbose, `[gwen build] No Cargo.toml found — using pre-compiled WASM from @gwen/engine-core`);
    const copyResult = copyPrecompiledWasm(wasmOutDir, verbose);
    if (!copyResult.success) {
      result.warnings.push(...copyResult.warnings);
      log(verbose, `[gwen build] ⚠ ${copyResult.warnings.join('; ')}`);
    } else {
      result.wasmBuilt = true;
      result.wasmOutputDir = wasmOutDir;
      log(verbose, `[gwen build] ✅ WASM artifacts copied → ${wasmOutDir}`);
    }
  }

  // ── Step 3: Générer le manifeste ─────────────────────────────────────────────
  fs.mkdirSync(outDir, { recursive: true });

  const manifest: WasmManifest = {
    version: '0.1.0',
    builtAt: new Date().toISOString(),
    engine: parsed.engine,
    plugins: parsed.plugins.map(p => {
      const entry: WasmManifest['plugins'][number] = {
        name: p.symbolName,
        type: p.type,
      };
      if (p.type === 'wasm' && result.wasmBuilt) {
        entry.wasmPath = `./wasm/${p.packageName.replace('@gwen/', '')}_bg.wasm`;
        entry.jsPath = `./wasm/${p.packageName.replace('@gwen/', '')}.js`;
      }
      return entry;
    }),
  };

  // Toujours inclure le gwen_core WASM s'il a été copié/compilé
  if (result.wasmBuilt && !manifest.plugins.find(p => p.name === 'gwen_core')) {
    manifest.plugins.unshift({
      name: 'gwen_core',
      type: 'wasm',
      wasmPath: './wasm/gwen_core_bg.wasm',
      jsPath: './wasm/gwen_core.js',
    });
  }

  const manifestPath = path.join(outDir, 'gwen-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  result.manifestPath = manifestPath;
  log(verbose, `[gwen build] ✅ Manifest → ${manifestPath}`);

  result.success = result.errors.length === 0;
  result.durationMs = Date.now() - start;

  if (result.success) {
    console.log(`[gwen build] ✅ Done in ${result.durationMs}ms`);
  } else {
    console.error(`[gwen build] ❌ Failed with ${result.errors.length} error(s)`);
    for (const e of result.errors) console.error(`  • ${e}`);
  }

  return result;
}

// ── Copie des artefacts pré-compilés depuis @gwen/engine-core ─────────────────

/**
 * Copie les artefacts WASM pré-compilés depuis le package @gwen/engine-core.
 * C'est le chemin pour les utilisateurs qui n'ont PAS de crate Rust custom.
 * Le package @gwen/engine-core publie son dossier wasm/ avec les artefacts
 * compilés en CI (GitHub Actions) — l'utilisateur n'a pas besoin de Rust.
 */
function copyPrecompiledWasm(
  destDir: string,
  verbose: boolean,
): { success: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Chercher @gwen/engine-core/wasm/ dans node_modules
  const candidates = [
    // node_modules standard (npm/pnpm)
    path.resolve(__dirname, '../../node_modules/@gwen/engine-core/wasm'),
    // workspace pnpm (résolution depuis le CLI lui-même)
    path.resolve(__dirname, '../../../node_modules/@gwen/engine-core/wasm'),
    // depuis le répertoire courant d'exécution
    path.resolve(process.cwd(), 'node_modules/@gwen/engine-core/wasm'),
    // artefacts locaux du monorepo (développement)
    path.resolve(__dirname, '../../engine-core/wasm'),
  ];

  let sourceDir: string | null = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      sourceDir = candidate;
      break;
    }
  }

  if (!sourceDir) {
    warnings.push(
      'Pre-compiled WASM not found in @gwen/engine-core/wasm/. ' +
      'Run: npm install @gwen/engine-core'
    );
    return { success: false, warnings };
  }

  fs.mkdirSync(destDir, { recursive: true });

  const wasmFiles = fs.readdirSync(sourceDir).filter(f =>
    f.endsWith('.wasm') || f.endsWith('.js') || f.endsWith('.d.ts')
  );

  if (wasmFiles.length === 0) {
    warnings.push(`No WASM artifacts found in ${sourceDir}`);
    return { success: false, warnings };
  }

  for (const file of wasmFiles) {
    const src = path.join(sourceDir, file);
    const dest = path.join(destDir, file);
    fs.copyFileSync(src, dest);
    log(verbose, `[gwen build] copied ${file}`);
  }

  return { success: true, warnings };
}

// ── wasm-pack wrapper (crate Rust custom) ────────────────────────────────────

function buildWasmFromCrate(
  cratePath: string,
  outDir: string,
  mode: 'release' | 'debug',
  verbose: boolean,
): { success: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const wasmPack = findWasmPack();
  if (!wasmPack) {
    errors.push(
      'wasm-pack not found. Install with: cargo install wasm-pack\n' +
      'Or: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh\n' +
      'Note: wasm-pack is only needed for custom Rust plugins, not for standard GWEN projects.'
    );
    return { success: false, errors, warnings };
  }

  fs.mkdirSync(outDir, { recursive: true });

  const args = [
    'build',
    '--target', 'web',
    '--out-dir', outDir,
    mode === 'release' ? '--release' : '--dev',
    cratePath,
  ];

  log(verbose, `[gwen build] Running: ${wasmPack} ${args.join(' ')}`);

  const result = spawnSync(wasmPack, args, {
    stdio: verbose ? 'inherit' : 'pipe',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? '';
    errors.push(`wasm-pack failed (exit ${result.status}):\n${stderr}`);
    return { success: false, errors, warnings };
  }

  return { success: true, errors, warnings };
}

function findWasmPack(): string | null {
  const candidates = [
    'wasm-pack',
    `${process.env.HOME}/.cargo/bin/wasm-pack`,
    `${process.env.USERPROFILE}\\.cargo\\bin\\wasm-pack.exe`,
  ];
  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'ignore' });
      return candidate;
    } catch { /* not found */ }
  }
  return null;
}

function log(verbose: boolean, msg: string): void {
  if (verbose) console.log(msg);
}

