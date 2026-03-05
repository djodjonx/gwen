/**
 * Manifest generation
 */

import fs from 'node:fs/promises';
import { join } from 'pathe';
import { logger } from '../../utils/logger.js';
import type { GwenConfig } from '../../utils/validation.js';
import type { BuildContext } from './context.js';

interface Manifest {
  version: string;
  builtAt: string;
  engine: GwenConfig['engine'];
  plugins: Array<{
    name: string;
    type: 'wasm' | 'js';
    wasmPath?: string;
    jsPath?: string;
  }>;
}

/**
 * Generate and write build manifest
 */
export async function generateManifest(ctx: BuildContext): Promise<void> {
  if (!ctx.config) throw new Error('Config not loaded');

  await fs.mkdir(ctx.outDir, { recursive: true });

  const manifest: Manifest = {
    version: '0.2.0',
    builtAt: new Date().toISOString(),
    engine: ctx.config.engine,
    plugins: [
      {
        name: 'gwen_core',
        type: 'wasm',
        wasmPath: './wasm/gwen_core_bg.wasm',
        jsPath: './wasm/gwen_core.js',
      },
      ...(ctx.config.plugins ?? []).map((p) => ({
        name: p.symbolName,
        type: p.type as 'wasm' | 'js',
        ...(p.type === 'wasm'
          ? {
              wasmPath: `./wasm/${p.packageName.replace('@gwen/', '')}_bg.wasm`,
              jsPath: `./wasm/${p.packageName.replace('@gwen/', '')}.js`,
            }
          : {}),
      })),
    ],
  };

  const manifestPath = join(ctx.outDir, 'gwen-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  logger.debug(`Manifest written → ${manifestPath}`);
}
