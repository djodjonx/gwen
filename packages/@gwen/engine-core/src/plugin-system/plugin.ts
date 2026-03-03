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

import type { TsPlugin } from '../types';

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
export type PluginProvides<T> = T extends GwenPlugin<string, infer P> ? P : Record<string, unknown>;

/**
 * Merges `provides` from all plugins in a list.
 */
export type MergeProvides<Plugins extends readonly GwenPlugin[]> = UnionToIntersection<
  PluginProvides<Plugins[number]>
> &
  Record<string, unknown>;

// ── GwenPlugin interface ──────────────────────────────────────────────────────

/**
 * Typed GWEN plugin.
 *
 * `N` = literal plugin name (e.g., `'InputPlugin'`)
 * `P` = service map exposed by this plugin (e.g., `{ keyboard: KeyboardInput }`)
 */
export interface GwenPlugin<
  N extends string = string,
  out P extends Record<string, unknown> = Record<string, unknown>,
> extends TsPlugin {
  readonly name: N;
  /**
   * Declares services that this plugin injects into `api.services`.
   * Values are phantom types (`{} as ServiceType`) — never read at runtime.
   * Used only for TypeScript type inference.
   */
  readonly provides?: P;
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
   * Liste de références de types à injecter dans `.gwen/gwen.d.ts`
   * sous forme de `/// <reference types="..." />`.
   *
   * Activés uniquement si le plugin est déclaré dans `gwen.config.ts`.
   */
  typeReferences?: string[];
}
