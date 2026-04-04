/**
 * @file gwen:physics3d — Vite plugin for layer inlining and build-time optimizations.
 */
import type { Plugin } from 'vite';

/**
 * Extract layer name → value entries from a `defineLayers({...})` call in source code.
 *
 * Only handles simple numeric literal expressions (integers, hex literals, binary literals,
 * and shift expressions). Complex runtime expressions are skipped silently.
 *
 * @param code - The TypeScript/JavaScript source file contents.
 * @returns A `Map<string, number>` when at least one entry was parsed, or `null`.
 *
 * @internal Exported for unit tests.
 */
export function extractLayerDefinitions(code: string): Map<string, number> | null {
  const match = code.match(/defineLayers\s*\(\s*\{([^}]+)\}\s*\)/);
  if (!match) return null;

  const layerMap = new Map<string, number>();
  const entries = match[1].matchAll(/(\w+)\s*:\s*(.+?)(?:,|\s*$)/gm);

  for (const entry of entries) {
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`'use strict'; return (${entry[2].trim()})`)() as number;
      layerMap.set(entry[1].trim(), value);
    } catch {
      // skip complex expressions that cannot be statically evaluated
    }
  }

  return layerMap.size > 0 ? layerMap : null;
}

/**
 * Replace `VarName.layerName` references with their literal numeric values.
 *
 * Only replaces whole-word identifier references (uses `\b` word boundaries) to
 * avoid accidentally replacing identifiers that merely contain the layer name.
 *
 * @param code - Source code to transform.
 * @param varName - The variable name of the `defineLayers` result (e.g., `'Layers'`).
 * @param layerMap - Map of layer name → numeric value from {@link extractLayerDefinitions}.
 * @returns Transformed source code with layer references replaced by numeric literals.
 *
 * @internal Exported for unit tests.
 */
export function inlineLayerReferences(
  code: string,
  varName: string,
  layerMap: Map<string, number>,
): string {
  let result = code;
  for (const [name, value] of layerMap) {
    result = result.replace(new RegExp(`\\b${varName}\\.${name}\\b`, 'g'), String(value));
  }
  return result;
}

/**
 * Options accepted by {@link physics3dVitePlugin}.
 */
export interface Physics3DVitePluginOptions {
  /**
   * Log inlining activity to the console when layer constants are replaced.
   * @default false
   */
  debug?: boolean;
}

/**
 * `gwen:physics3d` — Vite plugin for Physics 3D build-time optimizations.
 *
 * Currently performs one transformation:
 * - **Layer inlining**: replaces `Layers.player` references (from a `defineLayers()`
 *   call) with their literal bitmask values, enabling dead-code elimination in
 *   optimised builds.
 *
 * Registered automatically by the `physics3dModule` when added to the GWEN config.
 * Can also be added manually to a plain Vite config:
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { physics3dVitePlugin } from '@gwenjs/physics3d'
 *
 * export default {
 *   plugins: [physics3dVitePlugin({ debug: true })],
 * }
 * ```
 *
 * @param options - Optional debug flag.
 * @returns A Vite {@link Plugin} object.
 *
 * @since 1.0.0
 */
export function physics3dVitePlugin(options: Physics3DVitePluginOptions = {}): Plugin {
  return {
    name: 'gwen:physics3d',
    transform(code, id) {
      if (!/\.(ts|tsx|js|jsx)$/.test(id)) return;
      if (!code.includes('defineLayers')) return;

      const layerMap = extractLayerDefinitions(code);
      if (!layerMap) return;

      const varMatch = code.match(/const\s+(\w+)\s*=\s*defineLayers\s*\(/);
      if (!varMatch) return;

      const transformed = inlineLayerReferences(code, varMatch[1], layerMap);

      if (options.debug && transformed !== code) {
        console.log(`[gwen:physics3d] Inlined ${layerMap.size} layer constants in ${id}`);
      }

      return { code: transformed, map: null };
    },
  };
}
