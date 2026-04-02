/**
 * @gwenjs/cli — Builder (v0.2.0)
 *
 * Build orchestration for GWEN projects.
 * Pipeline:
 *  1. Load and validate config
 *  2. Copy pre-compiled WASM from @gwenjs/core
 *  3. Generate manifest JSON
 *  4. Prepare project artifacts
 *  5. Run Vite build
 *
 * @example
 * ```typescript
 * import { build } from '@gwenjs/cli';
 * const result = await build({ mode: 'release' });
 * if (result.success) {
 *   console.log('Build complete!');
 * }
 * ```
 */

import { resolve, join } from 'pathe';
import { loadGwenConfig } from '../config.js';
import { prepare } from '../prepare/index.js';
import { logger } from '../../utils/logger.js';
import { createBuildContext, getDuration, type BuildContext } from './context.js';
import { copyWasmArtifacts } from './wasm.js';
import { generateManifest } from './manifest.js';
import { runViteBuild } from './vite.js';
import { detectCoreVariant, detectSharedMemoryPlugins } from './variant-detector.js';
import { loadFrameworkContext } from '../app-context.js';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuildOptions {
  /**
   * Project root directory (default: process.cwd())
   */
  projectDir?: string;
  /**
   * Output directory (default: <projectDir>/dist)
   */
  outDir?: string;
  /**
   * Build mode: 'release' (optimized) or 'debug' (faster)
   */
  mode?: 'release' | 'debug';
  /**
   * Skip actual building (for testing)
   */
  dryRun?: boolean;
}

export interface BuildResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  durationMs: number;
}

// ── Main Build Function ──────────────────────────────────────────────────────

/**
 * Build a GWEN project for production
 *
 * @param options - Build configuration
 * @returns Build result with success/errors/warnings
 */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const outDir = resolve(options.outDir ?? join(projectDir, 'dist'));
  const mode = options.mode ?? 'release';
  const dryRun = options.dryRun ?? false;

  const ctx = createBuildContext(projectDir, outDir, mode, dryRun);

  logger.info(`Building project: ${projectDir}`);
  logger.debug(`Output directory: ${outDir}`);
  logger.debug(`Mode: ${mode}`);

  try {
    await loadConfig(ctx);
    await copyWasmArtifacts(ctx);
    await prepareBuildArtifacts(ctx);
    await generateManifest(ctx);
    await runViteBuild(ctx);
  } catch (error: unknown) {
    ctx.errors.push(getErrorMessage(error));
  }

  const result: BuildResult = {
    success: ctx.errors.length === 0,
    errors: ctx.errors,
    warnings: ctx.warnings,
    durationMs: getDuration(ctx),
  };

  if (result.success) {
    logger.success(`Build complete in ${result.durationMs}ms`);
  } else {
    logger.error(`Build failed with ${result.errors.length} error(s)`);
    for (const e of result.errors) {
      logger.error(`  • ${e}`);
    }
  }

  return result;
}

// ── Pipeline Steps ────────────────────────────────────────────────────────────

/**
 * Load and validate project config
 */
async function loadConfig(ctx: BuildContext): Promise<void> {
  logger.info('Loading configuration...');

  try {
    const loaded = await loadGwenConfig(ctx.projectDir);
    ctx.config = loaded.config;
    ctx.configPath = loaded.configPath;

    // Module-first framework path: resolve runtime plugins through @gwenjs/app.
    if (ctx.config.modules.length > 0) {
      const framework = await loadFrameworkContext(ctx.projectDir);
      ctx.config.plugins = framework.plugins;
    }

    // Detect core variant (light, physics2d, physics3d)
    ctx.variant = detectCoreVariant(ctx.config);
    logger.info(`Core variant: ${ctx.variant} (auto-detected)`);

    const sabPlugins = detectSharedMemoryPlugins(ctx.config);
    if (sabPlugins.length > 0) {
      logger.warn(
        'SharedArrayBuffer required by plugin(s): ' +
          sabPlugins.map((n) => `'${n}'`).join(', ') +
          '. Configure COOP/COEP headers (Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp).',
      );
    }

    logger.debug('Config loaded and validated');
  } catch (error: unknown) {
    throw new Error(`Config loading failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Prepare project artifacts
 */
async function prepareBuildArtifacts(ctx: BuildContext): Promise<void> {
  if (ctx.dryRun) return;

  logger.info('Preparing project artifacts...');
  const prepareResult = await prepare({
    projectDir: ctx.projectDir,
    verbose: ctx.mode === 'release',
  });

  if (!prepareResult.success) {
    const errors = prepareResult.errors.join('; ');
    throw new Error(`Prepare failed: ${errors}`);
  }
}

export type { BuildContext } from './context.js';
