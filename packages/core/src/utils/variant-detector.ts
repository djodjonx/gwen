/**
 * Core variant detector for GWEN.
 *
 * Determines which core WASM variant (light, physics2d, physics3d) to use
 * based on the plugins declared in the project configuration.
 */

import type { CoreVariant } from '../engine/wasm-bridge';

/**
 * Interface that matches the relevant part of GwenConfig for detection.
 */
interface VariantConfig {
  plugins?: Array<{ name: string; wasm?: { sharedMemory?: boolean } }>;
}

/**
 * Determine the core WASM variant from the project configuration.
 *
 * Rules (in order of priority):
 * 1. If 'Physics3D' plugin is present → 'physics3d'
 * 2. If 'Physics2D' plugin is present → 'physics2d'
 * 3. Default → 'light'
 *
 * @param config - The loaded GwenConfig object
 * @returns The detected CoreVariant
 */
export function detectCoreVariant(config: VariantConfig): CoreVariant {
  if (!config || !Array.isArray(config.plugins)) {
    return 'light';
  }

  const pluginNames = config.plugins.map((p) => p.name);

  if (pluginNames.includes('Physics3D')) {
    return 'physics3d';
  }

  if (pluginNames.includes('Physics2D')) {
    return 'physics2d';
  }

  return 'light';
}

/**
 * Returns true when at least one plugin explicitly opts into SAB.
 */
export function detectSharedMemoryRequired(config: VariantConfig): boolean {
  if (!config || !Array.isArray(config.plugins)) {
    return false;
  }
  return config.plugins.some((p) => p?.wasm?.sharedMemory === true);
}
