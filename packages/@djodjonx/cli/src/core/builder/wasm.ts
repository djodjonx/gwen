/**
 * WASM artifacts handling
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'pathe';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';
import type { BuildContext } from './context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Copy pre-compiled WASM artifacts from @gwen/engine-core
 */
export async function copyWasmArtifacts(ctx: BuildContext): Promise<void> {
  if (ctx.dryRun) return;

  logger.info('Copying pre-compiled WASM artifacts...');
  const wasmOutDir = join(ctx.outDir, 'wasm');
  const copyResult = await copyPrecompiledWasm(wasmOutDir);

  if (!copyResult.success) {
    ctx.warnings.push(...copyResult.warnings);
    logger.warn('WASM copy had warnings');
  } else {
    logger.success(`WASM artifacts copied → ${wasmOutDir}`);
  }
}

/**
 * Copy pre-compiled WASM from @gwen/engine-core/wasm/
 */
async function copyPrecompiledWasm(
  destDir: string,
): Promise<{ success: boolean; warnings: string[] }> {
  const warnings: string[] = [];

  // Search candidates for @gwen/engine-core/wasm/
  const candidates = [
    resolve(__dirname, '../../node_modules/@gwen/engine-core/wasm'),
    resolve(__dirname, '../../../node_modules/@gwen/engine-core/wasm'),
    resolve(process.cwd(), 'node_modules/@gwen/engine-core/wasm'),
    resolve(__dirname, '../../engine-core/wasm'),
  ];

  let sourceDir: string | null = null;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      sourceDir = candidate;
      logger.debug(`Found WASM source: ${sourceDir}`);
      break;
    }
  }

  if (!sourceDir) {
    warnings.push(
      'Pre-compiled WASM not found in @gwen/engine-core/wasm/. ' +
        'Run: pnpm install @gwen/engine-core',
    );
    return { success: false, warnings };
  }

  await fs.mkdir(destDir, { recursive: true });

  const files = await fs.readdir(sourceDir);
  const wasmFiles = files.filter(
    (f) => f.endsWith('.wasm') || f.endsWith('.js') || f.endsWith('.d.ts'),
  );

  if (wasmFiles.length === 0) {
    warnings.push(`No WASM artifacts found in ${sourceDir}`);
    return { success: false, warnings };
  }

  for (const file of wasmFiles) {
    const src = join(sourceDir, file);
    const dest = join(destDir, file);
    await fs.copyFile(src, dest);
    logger.trace(`Copied ${file}`);
  }

  return { success: true, warnings };
}
