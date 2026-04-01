/**
 * @file Runtime utilities for the GWEN plugin system.
 *
 * Contains runtime functions that operate on `GwenPlugin` objects.
 * Kept separate from `types/plugin.ts` so that Vite does not tree-shake
 * them when bundling `@gwenengine/core`.
 */

import type { GwenPlugin, GwenPluginWasmContext } from '../types/plugin';

/**
 * Runtime type guard — returns `true` if `plugin` has a valid WASM context.
 *
 * Used internally by `createEngine()` to split a mixed `plugins` array into
 * WASM and TS-only lists before initialisation.
 *
 * A plugin is considered a WASM plugin when:
 * - `plugin.wasm` is a non-null object
 * - `plugin.wasm.id` is a non-empty string
 * - `plugin.wasm.onInit` is a function
 *
 * @param plugin - Any `GwenPlugin` instance.
 * @returns `true` if the plugin has a WASM context.
 *
 * @example
 * ```ts
 * const wasmPlugins = plugins.filter(isWasmPlugin);
 * const tsPlugins   = plugins.filter(p => !isWasmPlugin(p));
 * ```
 */
export function isWasmPlugin(
  plugin: GwenPlugin,
): plugin is GwenPlugin & { wasm: GwenPluginWasmContext } {
  return (
    plugin.wasm !== undefined &&
    typeof plugin.wasm === 'object' &&
    typeof plugin.wasm.id === 'string' &&
    plugin.wasm.id.length > 0 &&
    typeof plugin.wasm.onInit === 'function'
  );
}
