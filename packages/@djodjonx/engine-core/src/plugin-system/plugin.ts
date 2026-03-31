/**
 * @file GWEN Plugin System — typed plugin interface and utility types.
 *
 * Provides the strongly-typed `GwenPlugin` class-decorator pattern and the
 * type-level helpers used by `defineConfig()` to infer the merged service map
 * and hooks map from a `plugins` array.
 *
 * @example
 * ```typescript
 * export class InputPlugin implements GwenPlugin<'InputPlugin', InputPluginServices> {
 *   readonly name = 'InputPlugin' as const;
 *   readonly provides = { keyboard: {} as KeyboardInput };
 *   onInit(api: EngineAPI) { api.services.register('keyboard', new KeyboardInput()); }
 * }
 *
 * export default defineConfig({
 *   plugins: [new InputPlugin(), new AudioPlugin()],
 * });
 * ```
 */

import type { GwenPlugin, GwenPluginWasmContext } from '../types/plugin';

// ── Re-export the unified interface so consumers only need one import ─────────

export type { GwenPlugin, GwenPluginWasmContext };
export { isWasmPlugin } from './plugin-utils';

// ── Utility types ─────────────────────────────────────────────────────────────

/**
 * Converts a union into an intersection: `A | B | C → A & B & C`.
 *
 * Used internally to merge service maps from multiple plugins.
 */
export type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

/**
 * Extracts the `provides` type from any `GwenPlugin`.
 *
 * Works for both TS-only plugins and WASM plugins because both shapes
 * carry the same `provides?` field on `GwenPlugin<N, P, H>`.
 *
 * @example
 * ```ts
 * type P = PluginProvides<InputPlugin>; // → { keyboard: KeyboardInput; ... }
 * ```
 */
export type PluginProvides<T> = T extends GwenPlugin<string, infer P, any> ? P : {};

/**
 * Extracts the `providesHooks` type from a `GwenPlugin`.
 *
 * @example
 * ```ts
 * type H = PluginProvidesHooks<Physics2DPlugin>; // → { 'physics:collision': ... }
 * ```
 */
export type PluginProvidesHooks<T> = T extends GwenPlugin<string, any, infer H> ? H : {};

/**
 * Normalises union results to an object shape (handles empty unions becoming unknown).
 * Ensures MergePluginsProvides/MergePluginsHooks always resolve to object types,
 * never to `never` or `unknown`.
 *
 * @internal
 */
export type AsObject<T> = T extends object ? T : {};

// ── Primary helpers (new — unified) ──────────────────────────────────────────

/**
 * Merges the `provides` types from **all** plugins in a mixed array
 * (TS-only and WASM plugins alike).
 *
 * This is the primary helper used by `defineConfig()`.
 * Because both plugin families share the same `provides?` field on
 * `GwenPlugin`, no special-casing is needed.
 *
 * @example
 * ```ts
 * type Services = MergePluginsProvides<[InputPlugin, Physics2DPlugin]>;
 * // → { keyboard: KeyboardInput; physics: Physics2DAPI }
 * ```
 */
export type MergePluginsProvides<Plugins extends readonly GwenPlugin[]> = AsObject<
  UnionToIntersection<PluginProvides<Plugins[number]>>
>;

/**
 * Merges the `providesHooks` types from all plugins in a mixed array,
 * and intersects with the built-in `GwenHooks`.
 *
 * WASM plugins that do not declare `providesHooks` contribute
 * `Record<string, never>` — a neutral element for intersection.
 *
 * @example
 * ```ts
 * type Hooks = MergePluginsHooks<[InputPlugin, Physics2DPlugin]>;
 * // → GwenHooks & { 'input:keyDown': ... } & { 'physics:collision': ... }
 * ```
 */
export type MergePluginsHooks<Plugins extends readonly GwenPlugin[]> =
  import('../hooks').GwenHooks &
    AsObject<UnionToIntersection<PluginProvidesHooks<Plugins[number]>>>;

// ── GwenPlugin re-exported for convenience ────────────────────────────────────
// (Consumers may import GwenPlugin directly from here or from '@djodjonx/gwen-engine-core')

/**
 * Static metadata declared alongside a plugin package.
 * Consumed by `gwen prepare` to enrich `.gwen/gwen.d.ts`.
 *
 * @example
 * ```ts
 * // @djodjonx/gwen-plugin-html-ui/src/index.ts
 * export const pluginMeta: GwenPluginMeta = {
 *   typeReferences: ['@djodjonx/gwen-plugin-html-ui/vite-env'],
 * };
 * ```
 */
export interface GwenPluginMeta {
  /**
   * Type reference paths injected into `.gwen/gwen.d.ts` as
   * `/// <reference types="..." />` directives.
   *
   * Active only when the plugin is declared in `gwen.config.ts`.
   */
  typeReferences?: string[];

  /**
   * Optional direct mapping used by `gwen prepare` to generate reliable
   * service typings via direct imports in `.gwen/gwen.d.ts`.
   */
  serviceTypes?: Record<
    string,
    {
      from: string;
      exportName: string;
    }
  >;

  /**
   * Optional direct mapping used by `gwen prepare` to augment hooks typing.
   */
  hookTypes?: Record<
    string,
    {
      from: string;
      exportName: string;
    }
  >;

  /**
   * Optional direct mapping used by `gwen prepare` to augment
   * `GwenPrefabExtensions` with strict plugin extension types.
   */
  prefabExtensionTypes?: Record<
    string,
    {
      from: string;
      exportName: string;
    }
  >;

  /** Optional direct mapping for `GwenSceneExtensions` augmentation. */
  sceneExtensionTypes?: Record<
    string,
    {
      from: string;
      exportName: string;
    }
  >;

  /** Optional direct mapping for `GwenUIExtensions` augmentation. */
  uiExtensionTypes?: Record<
    string,
    {
      from: string;
      exportName: string;
    }
  >;
}
