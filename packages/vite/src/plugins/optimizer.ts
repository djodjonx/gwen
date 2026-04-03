import type { Plugin } from 'vite';
import { ComponentManifest } from '../optimizer/component-manifest.js';
import { AstWalker } from '../optimizer/ast-walker.js';
import { PatternDetector } from '../optimizer/pattern-detector.js';
import type { WasmTier } from '../optimizer/types.js';

/** Options for `gwenOptimizerPlugin`. */
export interface GwenOptimizerOptions {
  /**
   * Enable verbose logging of detected and transformed patterns.
   * @default false
   */
  debug?: boolean;
  /**
   * Override the WASM tier for generated code.
   * Auto-detected from installed packages if not set.
   * @default 'core'
   */
  tier?: WasmTier;
}

/**
 * `gwen:optimizer` — opt-in Vite plugin that transforms ergonomic ECS systems
 * into zero-copy bulk WASM calls at build time.
 *
 * **Opt-in:** This plugin is NOT automatically included in `gwenVitePlugin()`.
 * Add it explicitly to your Vite config:
 *
 * ```ts
 * // vite.config.ts
 * import { gwenVitePlugin, gwenOptimizerPlugin } from '@gwenjs/vite'
 *
 * export default defineConfig({
 *   plugins: [
 *     gwenVitePlugin(),
 *     gwenOptimizerPlugin({ debug: true }), // ← opt-in
 *   ],
 * })
 * ```
 *
 * @performance
 * For 1000 entities, replaces N WASM boundary crossings with 1-2 per frame.
 * Benchmark target: < 0.5ms/frame for 10K entities (vs ~35ms naive).
 *
 * @phase Phase 1 — detection and classification scaffold.
 * Code rewriting (AST output back to source) is a Phase 2 concern.
 *
 * @param options - Plugin configuration options.
 * @returns A Vite plugin instance.
 */
export function gwenOptimizerPlugin(options: GwenOptimizerOptions = {}): Plugin {
  // tier will be used in Phase 2 when code generation is performed
  const { debug = false } = options;
  const _tier: WasmTier = options.tier ?? 'core';

  const manifest = new ComponentManifest();

  return {
    name: 'gwen:optimizer',

    /**
     * Reset the component manifest at build start.
     * Populated lazily in `transform` on each file encounter.
     *
     * @internal Called by Vite at build start (and on server restart in dev).
     */
    async buildStart() {
      manifest.clear();
      if (debug) {
        console.log('[gwen:optimizer] buildStart — manifest cleared, ready to scan');
      }
    },

    /**
     * Transform TypeScript system files: detect optimizable patterns and log them.
     *
     * Only processes `.ts` and `.tsx` files. Non-matching or unoptimizable files
     * return `null` (Vite convention: null = skip transformation).
     *
     * Phase 1: detection and classification only.
     * Phase 2 will perform AST-based code replacement and return transformed source.
     *
     * @param code - The source code of the file being transformed.
     * @param id   - The resolved file path / module ID.
     * @returns `null` to skip (Phase 1), or `{ code, map }` in Phase 2.
     */
    transform(code: string, id: string) {
      if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
      if (!code.includes('useQuery') || !code.includes('onUpdate')) return null;

      const walker = new AstWalker(id);
      const patterns = walker.walk(code);

      if (patterns.length === 0) return null;

      const detector = new PatternDetector(manifest);

      for (const pattern of patterns) {
        const result = detector.classify(pattern);
        if (!result.optimizable) {
          if (debug) {
            console.log(`[gwen:optimizer] Skipping pattern in ${id}: ${result.reason}`);
          }
          continue;
        }

        if (debug) {
          console.log(
            `[gwen:optimizer] Optimizable pattern in ${id}:`,
            pattern.queryComponents.join(', '),
          );
        }
      }

      // Phase 1: return null — transform wiring verified, no code changes yet.
      // Phase 2 will return { code: transformedCode, map: sourceMap }.
      return null;
    },
  };
}
