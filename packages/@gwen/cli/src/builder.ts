/**
 * @gwen/cli — Builder
 *
 * Orchestre le build complet d'un projet Gwen :
 *  1. Parse engine.config.ts
 *  2. Compile le crate Rust → WASM (wasm-pack build)
 *  3. Copie les artefacts WASM vers dist/wasm/
 *  4. Génère un manifeste JSON pour le runtime loader
 *
 * Usage programmatique :
 *   import { build } from '@gwen/cli';
 *   await build({ projectDir: process.cwd() });
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { findConfigFile, parseConfigFile, type EngineConfigParsed } from './config-parser.js';

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
  /** Si true, ne lance pas wasm-pack (utile pour les tests) */
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

  // ── Step 2: Build Rust crate → WASM ─────────────────────────────────────────
  const wasmOutDir = path.join(outDir, 'wasm');

  if (parsed.rustCratePath) {
    log(verbose, `[gwen build] Rust crate: ${parsed.rustCratePath}`);

    if (!dryRun) {
      const wasmBuildResult = buildWasm(parsed.rustCratePath, wasmOutDir, mode, verbose);
      if (!wasmBuildResult.success) {
        result.errors.push(...wasmBuildResult.errors);
        result.warnings.push(...wasmBuildResult.warnings);
        // Non-fatal: continue to generate manifest even if WASM build failed
        result.warnings.push('WASM build failed — manifest will be generated without WASM artifacts');
      } else {
        result.wasmBuilt = true;
        result.wasmOutputDir = wasmOutDir;
        log(verbose, `[gwen build] ✅ WASM built → ${wasmOutDir}`);
      }
    } else {
      log(verbose, `[gwen build] [dry-run] Would run: wasm-pack build ${parsed.rustCratePath}`);
      result.wasmBuilt = true; // Pretend success in dry-run
      result.wasmOutputDir = wasmOutDir;
    }
  } else {
    result.warnings.push('No Cargo.toml found — skipping WASM build');
    log(verbose, `[gwen build] ⚠ No Rust crate found, skipping WASM build`);
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

  // Always include the core gwen_core WASM if it was built
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

// ── wasm-pack wrapper ─────────────────────────────────────────────────────────

function buildWasm(
  cratePath: string,
  outDir: string,
  mode: 'release' | 'debug',
  verbose: boolean,
): { success: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Find wasm-pack
  const wasmPack = findWasmPack();
  if (!wasmPack) {
    errors.push(
      'wasm-pack not found. Install with: cargo install wasm-pack\n' +
      'Or: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh'
    );
    return { success: false, errors, warnings };
  }

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
  // Check common locations
  const candidates = [
    'wasm-pack',
    `${process.env.HOME}/.cargo/bin/wasm-pack`,
    `${process.env.USERPROFILE}\\.cargo\\bin\\wasm-pack.exe`,
  ];

  for (const candidate of candidates) {
    try {
      execSync(`"${candidate}" --version`, { stdio: 'ignore' });
      return candidate;
    } catch {
      // not found at this path
    }
  }
  return null;
}

function log(verbose: boolean, msg: string): void {
  if (verbose) console.log(msg);
}

