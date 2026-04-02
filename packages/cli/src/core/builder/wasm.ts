/**
 * WASM artifacts handling
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'pathe';
import { logger } from '../../utils/logger.js';
import type { BuildContext } from './context.js';
import { resolveWasmPath } from './variant-detector.js';

/**
 * Copy pre-compiled WASM artifacts from @gwenjs/core
 * to the build output directory.
 *
 * @param ctx - Current build context
 */
export async function copyWasmArtifacts(ctx: BuildContext): Promise<void> {
  if (ctx.dryRun) return;

  const variant = ctx.variant ?? 'light';
  logger.info(`Copying pre-compiled WASM artifacts (variant: ${variant})...`);

  try {
    const { jsPath, wasmPath } = resolveWasmPath(variant);
    const wasmOutDir = join(ctx.outDir, 'wasm');
    await fs.mkdir(wasmOutDir, { recursive: true });

    // Copy JS wrapper
    const destJs = join(wasmOutDir, 'gwen_core.js');
    await fs.copyFile(jsPath, destJs);

    // Copy WASM binary
    const destWasm = join(wasmOutDir, 'gwen_core_bg.wasm');
    await fs.copyFile(wasmPath, destWasm);

    // Also copy d.ts if it exists
    const dtsPath = jsPath.replace(/\.js$/, '.d.ts');
    if (existsSync(dtsPath)) {
      await fs.copyFile(dtsPath, join(wasmOutDir, 'gwen_core.d.ts'));
    }

    logger.success(`WASM artifacts (${variant}) copied → ${wasmOutDir}`);
  } catch (error: any) {
    ctx.warnings.push(`WASM artifacts copy failed: ${error.message}`);
    logger.warn(`WASM artifacts copy failed: ${error.message}`);
  }
}
