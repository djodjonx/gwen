/**
 * Manifest generation
 */

import fs from 'node:fs/promises';
import { join } from 'pathe';
import { logger } from '../../utils/logger.js';
import type { GwenOptions } from '@gwenengine/schema';
import type { BuildContext } from './context.js';

interface Manifest {
  version: string;
  builtAt: string;
  engine: GwenOptions['engine'];
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
      ...(ctx.config.plugins ?? []).map((p: any) => {
        const isLegacy = 'packageName' in p;
        const name = isLegacy ? p.symbolName : p.name;
        const type = isLegacy ? p.type : p.wasm ? 'wasm' : 'js';
        const pkgName = isLegacy ? p.packageName : p.wasm?.id || '';

        return {
          name,
          type: type as 'wasm' | 'js',
          ...(type === 'wasm' && pkgName
            ? {
                wasmPath: `./wasm/${pkgName.replace('@gwenengine/gwen-', '')}_bg.wasm`,
                jsPath: `./wasm/${pkgName.replace('@gwenengine/gwen-', '')}.js`,
              }
            : {}),
        };
      }),
    ],
  };

  const manifestPath = join(ctx.outDir, 'gwen-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  logger.debug(`Manifest written → ${manifestPath}`);
}
