/**
 * Vite build execution
 */

import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { join } from 'pathe';
import { logger } from '../../utils/logger.js';
import type { BuildContext } from './context.js';

/**
 * Run Vite build
 */
export async function runViteBuild(ctx: BuildContext): Promise<void> {
  if (ctx.dryRun) return;

  if (!ctx.configPath) throw new Error('Config path not set');

  logger.info('Running Vite build...');

  const { buildViteConfig } = await import('../../vite-config-builder.js');
  const viteConfig = await buildViteConfig(ctx.projectDir, ctx.configPath, {
    mode: 'production',
    outDir: ctx.outDir,
  });

  const { build: viteBuild } = await import('vite');
  await viteBuild(viteConfig);

  await moveBuiltHtml(ctx.outDir);
  logger.success('Vite build complete');
}

/**
 * Move built HTML from .gwen/ to root
 */
async function moveBuiltHtml(outDir: string): Promise<void> {
  const builtHtml = join(outDir, '.gwen', 'index.html');
  if (existsSync(builtHtml)) {
    await fs.rename(builtHtml, join(outDir, 'index.html'));
    await fs.rm(join(outDir, '.gwen'), { recursive: true, force: true });
  }
}
