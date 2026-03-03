/**
 * GWEN Plugin System — typed plugin declaration
 *
 * `createPlugin()` allows you to declare a plugin with its exposed services.
 * Two syntaxes supported — identical to defineUI and defineScene.
 *
 * **Form 1 — direct object** (no local state):
 * ```typescript
 * export const AiSystem = createPlugin({
 *   name: 'AiSystem' as const,
 *   onUpdate(api, dt) { ... },
 * });
 * // Usage:
 * scene.plugins = [AiSystem];
 * ```
 *
 * **Form 2 — factory** (with local state in closure, no global variables):
 * ```typescript
 * export const SpawnerSystem = createPlugin('SpawnerSystem', () => {
 *   let timer = 0;
 *   return {
 *     onInit()        { timer = 0; },
 *     onUpdate(_, dt) { timer += dt; },
 *   };
 * });
 * // Usage:
 * scene.plugins = [SpawnerSystem()];
 * ```
 *
 * **Form 2 with dependencies** (typed deps, no `any`):
 * ```typescript
 * export const PlayerSystem = createPlugin('PlayerSystem', (scenes: SceneManager) => {
 *   let keyboard: KeyboardInput | null = null;
 *   return {
 *     onInit(api) { keyboard = api.services.get('keyboard'); },
 *     onUpdate(api, dt) { ... },
 *   };
 * });
 * // Usage:
 * scene.plugins = [PlayerSystem(scenes)];
 * ```
 */

import type { TsPlugin, EngineAPI } from './types';

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
export type PluginProvides<T> = T extends GwenPlugin<string, infer P> ? P : Record<string, never>;

/**
 * Merges `provides` from all plugins in a list.
 */
export type MergeProvides<Plugins extends readonly AnyGwenPlugin[]> = UnionToIntersection<
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
  P extends Record<string, unknown> = Record<string, never>,
> extends TsPlugin {
  readonly name: N;
  /**
   * Declares services that this plugin injects into `api.services`.
   * Values are phantom types (`{} as ServiceType`) — never read at runtime.
   * Used only for TypeScript type inference.
   */
  readonly provides?: P;
}

/** Convenient alias for a GwenPlugin without constraints on N/P */
export type AnyGwenPlugin = GwenPlugin<string, Record<string, unknown>>;

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

// ── createPlugin() ────────────────────────────────────────────────────────────

/** Définition complète passée à la forme objet de createPlugin() */
export interface GwenPluginDef<N extends string, P extends Record<string, unknown>> {
  readonly name: N;
  readonly provides?: P;
  onInit?(api: EngineAPI): void;
  onBeforeUpdate?(api: EngineAPI, deltaTime: number): void;
  onUpdate?(api: EngineAPI, deltaTime: number): void;
  onRender?(api: EngineAPI): void;
  onDestroy?(): void;
}

/** Corps d'un plugin sans le `name` — utilisé par la forme factory */
export type GwenPluginBody<P extends Record<string, unknown> = Record<string, never>> = Omit<
  GwenPluginDef<string, P>,
  'name'
>;

/**
 * Factory de plugin retournée par `createPlugin(name, factory)`.
 * Porte `pluginName` pour l'introspection avant appel.
 */
export type GwenPluginFactory<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
  Args extends unknown[] = [],
> = ((...args: Args) => GwenPlugin<N, P>) & { readonly pluginName: N };

// Overload 1 — direct object
export function createPlugin<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
>(def: GwenPluginDef<N, P>): GwenPlugin<N, P>;

// Overload 2 — factory (required)
export function createPlugin<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
  Args extends unknown[] = [],
>(name: N, factory: (...args: Args) => GwenPluginBody<P>): GwenPluginFactory<N, P, Args>;

// Implementation
export function createPlugin<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
  Args extends unknown[] = [],
>(
  nameOrDef: N | GwenPluginDef<N, P>,
  factory?: (...args: Args) => GwenPluginBody<P>,
): GwenPlugin<N, P> | GwenPluginFactory<N, P, Args> {
  if (typeof nameOrDef === 'string') {
    // Form 2 — factory callable with pluginName annotated
    const fn = (...args: Args): GwenPlugin<N, P> => ({
      name: nameOrDef,
      ...factory!(...args),
    });
    (fn as GwenPluginFactory<N, P, Args> as { pluginName: N }).pluginName = nameOrDef;
    return fn as GwenPluginFactory<N, P, Args>;
  }
  // Forme 1 — objet direct
  return nameOrDef as GwenPlugin<N, P>;
}
