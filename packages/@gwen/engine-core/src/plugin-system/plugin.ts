/**
 * GWEN Plugin System — typed plugin interface
 *
 * Plugins are TypeScript classes that implement `GwenPlugin<N, P>` interface.
 *
 * `N` = literal plugin name (e.g., `'InputPlugin'`)
 * `P` = service map exposed by this plugin (e.g., `{ keyboard: KeyboardInput }`)
 *
 * **Example:**
 * ```typescript
 * export class InputPlugin implements GwenPlugin<'InputPlugin', InputPluginServices> {
 *   readonly name = 'InputPlugin' as const;
 *   readonly provides = {
 *     keyboard: {} as KeyboardInput,
 *     mouse: {} as MouseInput,
 *     gamepad: {} as GamepadInput,
 *   };
 *
 *   onInit(api: EngineAPI) {
 *     // Initialize services
 *     api.services.register('keyboard', new KeyboardInput());
 *     api.services.register('mouse', new MouseInput());
 *     api.services.register('gamepad', new GamepadInput());
 *   }
 *
 *   onBeforeUpdate(api: EngineAPI, dt: number) {
 *     // Update input state
 *   }
 *
 *   onDestroy() {
 *     // Cleanup
 *   }
 * }
 * ```
 *
 * **Registration in config:**
 * ```typescript
 * export default defineConfig({
 *   engine: { maxEntities: 5000 },
 *   plugins: [
 *     new InputPlugin(),
 *     new AudioPlugin({ masterVolume: 0.8 }),
 *     new Canvas2DRenderer({ width: 800, height: 600 })
 *   ]
 * });
 * ```
 */

import type { TsPlugin, GwenWasmPlugin } from '../types';

// ── Utility types ────────────────────────────────────────────────────────────

/**
 * Converts a union into an intersection: A | B | C → A & B & C
 */
export type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

/**
 * Extracts the `provides` type from a GwenPlugin.
 */
export type PluginProvides<T> =
  T extends GwenPlugin<string, infer P, any> ? P : Record<string, unknown>;

/**
 * Extracts the `providesHooks` type from a GwenPlugin.
 */
export type PluginProvidesHooks<T> =
  T extends GwenPlugin<string, any, infer H> ? H : Record<string, never>;

/**
 * Extracts the `provides` type from a GwenWasmPlugin.
 */
export type WasmPluginProvides<T> = T extends GwenWasmPlugin<infer P> ? P : Record<string, unknown>;

/**
 * Merges `provides` from all TsPlugins in a list.
 */
export type MergeProvides<Plugins extends readonly GwenPlugin[]> = UnionToIntersection<
  PluginProvides<Plugins[number]>
> &
  Record<string, unknown>;

/**
 * Merges `providesHooks` from all TsPlugins in a list.
 */
export type MergeHooks<Plugins extends readonly GwenPlugin[]> = UnionToIntersection<
  PluginProvidesHooks<Plugins[number]>
> &
  Record<string, any>;

/**
 * Merges `provides` from all WasmPlugins in a list.
 */
export type MergeWasmProvides<Plugins extends readonly GwenWasmPlugin[]> = UnionToIntersection<
  WasmPluginProvides<Plugins[number]>
> &
  Record<string, unknown>;

/**
 * Merges `provides` from both TsPlugins and WasmPlugins.
 */
export type MergeAllProvides<
  TsPlugins extends readonly GwenPlugin[],
  WasmPlugins extends readonly GwenWasmPlugin[],
> = MergeProvides<TsPlugins> & MergeWasmProvides<WasmPlugins>;

/**
 * Merges `providesHooks` from all TsPlugins and system hooks.
 */
export type MergeAllHooks<TsPlugins extends readonly GwenPlugin[]> = import('../hooks').GwenHooks &
  MergeHooks<TsPlugins>;

// ── GwenPlugin interface ──────────────────────────────────────────────────────

/**
 * Typed GWEN plugin.
 *
 * `N` = literal plugin name (e.g., `'InputPlugin'`)
 * `P` = service map exposed by this plugin (e.g., `{ keyboard: KeyboardInput }`)
 * `H` = custom hooks exposed by this plugin (e.g., `{ 'input:keyPress': (...) => void }`)
 *
 * @example
 * ```typescript
 * export interface InputPluginHooks {
 *   'input:keyDown': (key: string) => void;
 *   'input:keyUp': (key: string) => void;
 * }
 *
 * export class InputPlugin implements GwenPlugin<'InputPlugin', InputPluginServices, InputPluginHooks> {
 *   readonly name = 'InputPlugin' as const;
 *   readonly provides = { keyboard: {} as KeyboardInput };
 *   readonly providesHooks = {} as InputPluginHooks;
 *   // ...
 * }
 * ```
 */
export interface GwenPlugin<
  N extends string = string,
  out P extends Record<string, unknown> = Record<string, unknown>,
  out H extends Record<string, any> = Record<string, never>,
> extends TsPlugin {
  readonly name: N;
  /**
   * Declares services that this plugin injects into `api.services`.
   * Values are phantom types (`{} as ServiceType`) — never read at runtime.
   * Used only for TypeScript type inference.
   */
  readonly provides?: P;
  /**
   * Declares custom hooks that this plugin exposes for other plugins.
   * Values are phantom types (`{} as HookInterface`) — never read at runtime.
   * Used only for TypeScript type inference.
   *
   * Extracted by `gwen prepare` and merged into `GwenDefaultHooks` in `.gwen/gwen.d.ts`.
   */
  readonly providesHooks?: H;
}

// ── GwenPluginMeta ────────────────────────────────────────────────────────────

/**
 * Static metadata declared by a GWEN plugin.
 * Consumed by `gwen prepare` to enrich `.gwen/gwen.d.ts`.
 *
 * @example
 * ```ts
 * // In @gwen/plugin-html-ui/src/index.ts
 * export const pluginMeta: GwenPluginMeta = {
 *   typeReferences: ['@gwen/plugin-html-ui/vite-env'],
 * };
 * ```
 */
export interface GwenPluginMeta {
  /**
   * Type reference paths to inject into `.gwen/gwen.d.ts` as
   * `/// <reference types="..." />` directives.
   *
   * Only active when the plugin is declared in `gwen.config.ts`.
   */
  typeReferences?: string[];
}
