/**
 * @file @gwenengine/app — public API surface.
 *
 * This is the primary entry point for GWEN project configuration and the
 * module system orchestrator. Import `defineConfig` here in `gwen.config.ts`.
 *
 * @example
 * ```typescript
 * // gwen.config.ts
 * import { defineConfig } from '@gwenengine/app'
 * export default defineConfig({
 *   modules: ['@gwenengine/physics2d'],
 *   engine: { maxEntities: 5_000 },
 * })
 * ```
 */

// ─── Config helpers ───────────────────────────────────────────────────────────

export { defineConfig, resolveConfig, resolveGwenConfig } from './config.js';
export type {
  GwenUserConfig,
  ResolvedGwenConfig,
  GwenModuleOptions,
  GwenModuleEntry,
  /** Re-exported for convenience — build hooks live in kit but are surfaced here. */
  GwenBuildHooks,
} from './config.js';

// ─── App orchestrator ─────────────────────────────────────────────────────────

export { GwenApp } from './app.js';

// ─── Module authoring API (re-exported from @gwenengine/kit) ──────────────────

/**
 * Define a GWEN module — the primary way to extend a project's build pipeline.
 * Re-exported from `@gwenengine/kit` so that consumers only need to import
 * from `@gwenengine/app` for both project configuration and module authoring.
 */
export { defineGwenModule } from '@gwenengine/kit';
export type {
  GwenModule,
  GwenModuleDefinition,
  GwenKit,
  AutoImport,
  GwenTypeTemplate,
} from '@gwenengine/kit';
