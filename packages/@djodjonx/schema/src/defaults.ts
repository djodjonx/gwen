/**
 * GWEN Configuration Schema - Defaults and Resolution
 *
 * Default configuration values and merge logic using defu.
 *
 * @module @djodjonx/gwen-schema
 */

import { defu } from 'defu';
import type { GwenOptions, GwenConfigInput, GwenPluginBase } from './config';
import { validateResolvedConfig } from './validate';

/**
 * Default GWEN configuration values.
 *
 * Used as the base for all configurations. User-provided values are merged
 * on top of these defaults using `defu()`.
 */
export const defaultOptions: GwenOptions = {
  engine: {
    maxEntities: 5000,
    targetFPS: 60,
    debug: false,
    enableStats: true,
  },
  html: {
    title: 'GWEN Project',
    background: '#000000',
  },
  plugins: [],
  scenes: [],
  scenesMode: 'auto',
  srcDir: 'src',
  outDir: 'dist',
};

/**
 * Resolve a partial user configuration into a fully normalized GwenOptions.
 *
 * This function:
 * 1. Merges user input with defaults using deep merge (defu)
 * 2. Unifies `tsPlugins` and `wasmPlugins` arrays into single `plugins` array
 * 3. Validates the final configuration with custom rules
 * 4. Returns a fully typed and validated GwenOptions
 *
 * @param input - Partial user configuration (can include legacy `tsPlugins`/`wasmPlugins`)
 * @returns Fully resolved and validated GwenOptions
 * @throws Error if validation fails with descriptive message
 *
 * @example
 * ```ts
 * const config = resolveConfig({
 *   engine: { maxEntities: 10_000 },
 *   plugins: [myPlugin],
 * });
 * ```
 */
export function resolveConfig(input: GwenConfigInput = {}): GwenOptions {
  // Start with defaults and merge input using defu (right-side wins, deep merge)
  const merged = defu(input as Partial<GwenOptions>, defaultOptions) as GwenOptions;

  // Unify legacy plugin arrays into single plugins array
  const plugins: GwenPluginBase[] = [...(merged.plugins ?? [])];

  // Add legacy tsPlugins if present
  if (Array.isArray((input as any).tsPlugins)) {
    plugins.push(...(input as any).tsPlugins);
  }

  // Add legacy wasmPlugins if present
  if (Array.isArray((input as any).wasmPlugins)) {
    plugins.push(...(input as any).wasmPlugins);
  }

  // Create the final resolved config
  const resolved: GwenOptions = {
    engine: merged.engine,
    html: merged.html,
    plugins,
    scenes: merged.scenes ?? [],
    scenesMode: merged.scenesMode ?? 'auto',
    mainScene: merged.mainScene,
    rootDir: merged.rootDir,
    srcDir: merged.srcDir,
    outDir: merged.outDir,
    dev: merged.dev,
  };

  // Validate and return
  return validateResolvedConfig(resolved);
}
