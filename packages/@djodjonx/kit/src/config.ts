/**
 * Typed project configuration helper for GWEN apps.
 *
 * `defineConfig()` lives in `@djodjonx/gwen-kit` and carries plugin-derived service/hook
 * types for `gwen prepare`.
 */

import type { GwenConfigInput } from '@djodjonx/gwen-schema';
import type { GwenPlugin } from '@djodjonx/gwen-engine-core';

/** Converts a union to an intersection (`A | B` -> `A & B`). */
type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
  arg: infer I,
) => void
  ? I
  : never;

/** Extract `provides` map from a plugin. */
type PluginProvides<T> = T extends GwenPlugin<string, infer P, any> ? P : Record<string, never>;

/** Extract `providesHooks` map from a plugin. */
type PluginProvidesHooks<T> =
  T extends GwenPlugin<string, any, infer H> ? H : Record<string, never>;

/** Normalize unresolved unions to an object map. */
type AsObject<T> = T extends object ? T : Record<string, never>;

/** Merge all services from a plugins tuple. */
export type MergePluginsProvides<Plugins extends readonly GwenPlugin[]> = AsObject<
  UnionToIntersection<PluginProvides<Plugins[number]>>
>;

/** Merge all hooks from a plugins tuple and include core hooks. */
export type MergePluginsHooks<Plugins extends readonly GwenPlugin[]> =
  import('@djodjonx/gwen-schema').GwenHooks &
    AsObject<UnionToIntersection<PluginProvidesHooks<Plugins[number]>>>;

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
 * Same mechanics as `MergePluginsProvides` — uses `Plugins[number]` and
 * `UnionToIntersection`, never `any[]`, never `never` cascade.
 */
export type MergePluginsPrefabExtensions<Plugins extends readonly GwenPlugin[]> = AsObject<
  UnionToIntersection<PluginPrefabExt<Plugins[number]>>
>;

/** Merges the scene extension shapes from all plugins. */
export type MergePluginsSceneExtensions<Plugins extends readonly GwenPlugin[]> = AsObject<
  UnionToIntersection<PluginSceneExt<Plugins[number]>>
>;

/** Merges the UI extension shapes from all plugins. */
export type MergePluginsUIExtensions<Plugins extends readonly GwenPlugin[]> = AsObject<
  UnionToIntersection<PluginUIExt<Plugins[number]>>
>;

/**
 * Typed shape returned by `defineConfig()`.
 *
 * Phantom fields are used only for type extraction in the CLI generator.
 */
export interface TypedEngineConfig<
  Services extends object = Record<string, unknown>,
  Hooks extends object = Record<string, never>,
> extends GwenConfigInput {
  /** @internal compile-time marker */
  readonly _services: Services;
  /** @internal compile-time marker */
  readonly _hooks: Hooks;
}

/**
 * Define a GWEN config with strict plugin-based type inference.
 *
 * @param config User config input.
 * @returns Config carrying inferred service/hook maps.
 */
export function defineConfig<const Plugins extends readonly GwenPlugin[] = []>(
  config: Omit<GwenConfigInput, 'plugins'> & {
    plugins?: readonly [...Plugins];
  },
): TypedEngineConfig<MergePluginsProvides<Plugins>, MergePluginsHooks<Plugins>> {
  return config as unknown as TypedEngineConfig<
    MergePluginsProvides<Plugins>,
    MergePluginsHooks<Plugins>
  >;
}
