/**
 * Typed project configuration helper for GWEN plugins.
 *
 * Provides plugin extension-merging utilities and type re-exports.
 * `defineConfig()` lives in `@gwenjs/app` — not here.
 */

import type { GwenOptions } from '@gwenjs/schema';

/**
 * Re-export GwenOptions as GwenConfig for easier usage in CLI and tools.
 */
export type { GwenOptions as GwenConfig };

/** Converts a union to an intersection (`A | B` -> `A & B`). */
type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

/** Normalize unresolved unions to an object map. */
type AsObject<T> = T extends object ? T : Record<string, never>;

// ── Extension merging ─────────────────────────────────────────────────────────

/** Extract the prefab extension shape from a plugin (fallback {} if absent). */
type PluginPrefabExt<T> = T extends { extensions?: { prefab?: infer E } }
  ? E extends Record<string, unknown>
    ? E
    : {}
  : {};

/** Extract the scene extension shape from a plugin (fallback {} if absent). */
type PluginSceneExt<T> = T extends { extensions?: { scene?: infer E } }
  ? E extends Record<string, unknown>
    ? E
    : {}
  : {};

/** Extract the UI extension shape from a plugin (fallback {} if absent). */
type PluginUIExt<T> = T extends { extensions?: { ui?: infer E } }
  ? E extends Record<string, unknown>
    ? E
    : {}
  : {};

/**
 * Merges the prefab extension shapes from all plugins.
 * Works with any plugins that declare an `extensions.prefab` property.
 */
export type MergePluginsPrefabExtensions<Plugins extends readonly unknown[]> = AsObject<
  UnionToIntersection<PluginPrefabExt<Plugins[number]>>
>;

/** Merges the scene extension shapes from all plugins. */
export type MergePluginsSceneExtensions<Plugins extends readonly unknown[]> = AsObject<
  UnionToIntersection<PluginSceneExt<Plugins[number]>>
>;

/** Merges the UI extension shapes from all plugins. */
export type MergePluginsUIExtensions<Plugins extends readonly unknown[]> = AsObject<
  UnionToIntersection<PluginUIExt<Plugins[number]>>
>;
