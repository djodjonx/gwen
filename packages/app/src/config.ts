/**
 * @file RFC-004 — GwenUserConfig, defineConfig, resolveGwenConfig
 */

import { loadConfig } from 'c12';
import { defu } from 'defu';
import type { GwenPlugin, GwenBuildHooks } from '@gwenengine/kit';

/** Re-export for convenience — callers can import both from `@gwenengine/app`. */
export type { GwenBuildHooks } from '@gwenengine/kit';

// ─── GwenModuleOptions (augmentable) ─────────────────────────────────────────

/**
 * Augmented by each module package to add typed options.
 *
 * @example Adding physics2d options
 * ```typescript
 * // In @gwenengine/physics2d:
 * declare module '@gwenengine/app' {
 *   interface GwenModuleOptions {
 *     physics2d: { gravity: number }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GwenModuleOptions {}

/**
 * A module entry in `gwen.config.ts`.
 * Either a string (package name) or a `[name, options]` tuple.
 *
 * @example
 * ```typescript
 * modules: [
 *   '@gwenengine/physics2d',
 *   ['@gwenengine/input', { gamepad: true }],
 * ]
 * ```
 */
export type GwenModuleEntry = string | [name: string, options?: Record<string, unknown>];

/**
 * The full GWEN framework configuration shape.
 *
 * Module-specific options are typed via {@link GwenModuleOptions} declaration merging.
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
export interface GwenUserConfig {
  /**
   * List of modules to activate. Each entry is either a string or a `[name, options]` tuple.
   */
  modules?: GwenModuleEntry[];

  /** Core engine configuration */
  engine?: {
    maxEntities?: number;
    targetFPS?: number;
    variant?: 'light' | 'physics2d' | 'physics3d';
    loop?: 'internal' | 'external';
    maxDeltaSeconds?: number;
  };

  /** Direct Vite config extension (simple case). */
  vite?: Record<string, unknown>;

  /** Build-time hook subscriptions. */
  hooks?: Partial<GwenBuildHooks>;

  /** Plugins to register directly (without a module). */
  plugins?: GwenPlugin[];

  /** Module-specific options (typed via GwenModuleOptions augmentation). */
  [key: string]: unknown;
}

/** Fully resolved config (same shape as user config, with defaults filled in). */
export type ResolvedGwenConfig = GwenUserConfig & {
  engine: Required<NonNullable<GwenUserConfig['engine']>>;
  modules: GwenModuleEntry[];
};

const DEFAULT_ENGINE = {
  maxEntities: 10_000,
  targetFPS: 60,
  variant: 'light' as const,
  loop: 'internal' as const,
  maxDeltaSeconds: 0.1,
};

/**
 * Identity helper for `gwen.config.ts`. Provides TypeScript inference for module options.
 *
 * @example
 * ```typescript
 * import { defineConfig } from '@gwenengine/app'
 * export default defineConfig({
 *   modules: ['@gwenengine/physics2d'],
 *   engine: { maxEntities: 5_000 },
 * })
 * ```
 */
export function defineConfig(config: GwenUserConfig): GwenUserConfig {
  return config;
}

/**
 * Merge defaults into user config to produce a {@link ResolvedGwenConfig}.
 * Used internally by `GwenApp` and tests.
 *
 * @param config - User-supplied config (may be partial)
 */
export function resolveConfig(config: GwenUserConfig): ResolvedGwenConfig {
  return {
    ...config,
    modules: config.modules ?? [],
    engine: { ...DEFAULT_ENGINE, ...config.engine },
  };
}

/**
 * Loads `gwen.config.ts` from the project root using `c12` (with `jiti` for
 * TypeScript support) and merges it with defaults.
 *
 * Called by CLI commands (`gwen dev`, `gwen build`, `gwen prepare`) and
 * the Vite plugin to resolve the project configuration at build time.
 *
 * @param rootDir - Project root directory (defaults to `process.cwd()`).
 * @returns Fully resolved configuration with all defaults applied.
 *
 * @example
 * ```typescript
 * const config = await resolveGwenConfig()
 * // config.engine.maxEntities === 10_000 (default)
 * ```
 */
export async function resolveGwenConfig(rootDir?: string): Promise<ResolvedGwenConfig> {
  const { config: userConfig = {} } = await loadConfig<GwenUserConfig>({
    name: 'gwen',
    cwd: rootDir ?? process.cwd(),
    dotenv: true,
    jitiOptions: { interopDefault: true },
  });

  return defu(
    {
      ...userConfig,
      modules: userConfig.modules ?? [],
      engine: userConfig.engine ?? {},
    },
    {
      modules: [] as GwenModuleEntry[],
      engine: DEFAULT_ENGINE,
    },
  ) as ResolvedGwenConfig;
}
