/**
 * Core variant detector for @gwenjs/cli.
 *
 * Determines which core WASM variant (light, physics2d, physics3d) to use
 * based on the plugins declared in the user's gwen.config.ts.
 */

import { dirname, join, resolve } from 'pathe';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GwenOptions as GwenConfig } from '@gwenjs/schema';

interface SharedMemoryPlugin {
  name?: string;
  wasm?: {
    sharedMemory?: boolean;
  };
}

/**
 * Available core WASM variants.
 * - light: Minimal ECS core (default)
 * - physics2d: ECS + Rapier2D + Pathfinding 2D
 * - physics3d: ECS + Rapier3D + Pathfinding 3D
 */
export type CoreVariant = 'light' | 'physics2d' | 'physics3d';

/**
 * Determine the core WASM variant from the project configuration.
 *
 * Rules (in order of priority):
 * 1. If 'Physics3D' plugin is present → 'physics3d'
 * 2. If 'Physics2D' plugin is present → 'physics2d'
 * 3. Default → 'light'
 *
 * Detection is based on the `name` property of the plugins.
 *
 * @param config - The loaded GwenConfig object
 * @returns The detected CoreVariant
 */
export function detectCoreVariant(config: GwenConfig): CoreVariant {
  if (!config || !Array.isArray(config.plugins)) {
    return 'light';
  }

  const pluginNames = config.plugins.map((p: { name: string }) => p.name);

  if (pluginNames.includes('Physics3D')) {
    return 'physics3d';
  }

  if (pluginNames.includes('Physics2D')) {
    return 'physics2d';
  }

  return 'light';
}

/**
 * Returns plugin names that explicitly require SharedArrayBuffer.
 */
export function detectSharedMemoryPlugins(config: GwenConfig): string[] {
  if (!config || !Array.isArray(config.plugins)) {
    return [];
  }

  return config.plugins
    .filter((plugin): plugin is GwenConfig['plugins'][number] => {
      const candidate = plugin as SharedMemoryPlugin;
      return candidate.wasm?.sharedMemory === true;
    })
    .map((plugin) => String(plugin.name ?? 'unknown'));
}

/**
 * Resolve the path to the WASM files for a given variant.
 *
 * Searches for @gwenjs/core in node_modules and returns
 * the paths to the JS wrapper and WASM binary.
 *
 * @param variant - The core variant to resolve
 * @returns Object containing absolute paths to jsPath and wasmPath
 * @throws Error if the engine-core package or the variant cannot be found
 */
export function resolveWasmPath(variant: CoreVariant): {
  jsPath: string;
  wasmPath: string;
} {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  // Search candidates for @gwenjs/core/wasm/
  const candidates = [
    // Case 1: Running from dist in node_modules
    resolve(__dirname, '../../node_modules/@gwenjs/core'),
    resolve(__dirname, '../../../node_modules/@gwenjs/core'),
    // Case 2: Running from project root
    resolve(process.cwd(), 'node_modules/@gwenjs/core'),
    // Case 3: Workspace development (relative to cli package)
    resolve(__dirname, '../../../../crates/gwen-core/pkg'), // This might not be right for all setups
    resolve(__dirname, '../../engine-core'),
  ];

  let pkgDir: string | null = null;
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'package.json')) || existsSync(join(candidate, 'Cargo.toml'))) {
      pkgDir = candidate;
      break;
    }
  }

  if (!pkgDir) {
    throw new Error('[GWEN] Could not find @gwenjs/core package. Please ensure it is installed.');
  }

  const wasmDir = existsSync(join(pkgDir, 'wasm')) ? join(pkgDir, 'wasm') : pkgDir;
  const variantDir = join(wasmDir, variant);

  if (!existsSync(variantDir)) {
    // If specific variant not found, fallback to light if it's not already light
    if (variant !== 'light') {
      return resolveWasmPath('light');
    }
    throw new Error(`[GWEN] Could not find WASM artifacts for variant "${variant}" in ${wasmDir}`);
  }

  return {
    jsPath: join(variantDir, 'gwen_core.js'),
    wasmPath: join(variantDir, 'gwen_core_bg.wasm'),
  };
}
