/**
 * GWEN Plugin System — typed plugin declaration
 *
 * `createPlugin()` permet de déclarer un plugin avec ses services exposés.
 * Deux syntaxes supportées — identiques à defineUI et defineScene.
 *
 * **Forme 1 — objet direct** (sans état local) :
 * ```typescript
 * export const AiSystem = createPlugin({
 *   name: 'AiSystem' as const,
 *   onUpdate(api, dt) { ... },
 * });
 * // Usage :
 * scene.plugins = [AiSystem];
 * ```
 *
 * **Forme 2 — factory** (avec état local en closure, sans variables globales) :
 * ```typescript
 * export const SpawnerSystem = createPlugin('SpawnerSystem', () => {
 *   let timer = 0;
 *   return {
 *     onInit()        { timer = 0; },
 *     onUpdate(_, dt) { timer += dt; },
 *   };
 * });
 * // Usage :
 * scene.plugins = [SpawnerSystem()];
 * ```
 *
 * **Forme 2 avec dépendances** (deps typées, pas de `any`) :
 * ```typescript
 * export const PlayerSystem = createPlugin('PlayerSystem', (scenes: SceneManager) => {
 *   let keyboard: KeyboardInput | null = null;
 *   return {
 *     onInit(api) { keyboard = api.services.get('keyboard'); },
 *     onUpdate(api, dt) { ... },
 *   };
 * });
 * // Usage :
 * scene.plugins = [PlayerSystem(scenes)];
 * ```
 */

import type { TsPlugin, EngineAPI } from './types';

// ── Types utilitaires ─────────────────────────────────────────────────────────

/** Convertit une union en intersection : A | B | C → A & B & C */
export type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

/** Extrait le type `provides` d'un GwenPlugin */
export type PluginProvides<T> = T extends GwenPlugin<any, infer P> ? P : Record<string, never>;

/** Fusionne les `provides` de tous les plugins d'une liste */
export type MergeProvides<Plugins extends readonly AnyGwenPlugin[]> = UnionToIntersection<
  PluginProvides<Plugins[number]>
> &
  Record<string, unknown>;

// ── Interface GwenPlugin ──────────────────────────────────────────────────────

/**
 * Plugin GWEN typé.
 *
 * `N` = nom littéral du plugin (ex: `'InputPlugin'`)
 * `P` = map des services exposés (ex: `{ keyboard: KeyboardInput }`)
 */
export interface GwenPlugin<
  N extends string = string,
  P extends Record<string, unknown> = Record<string, never>,
> extends TsPlugin {
  readonly name: N;
  /**
   * Déclare les services que ce plugin injecte dans `api.services`.
   * Les valeurs sont des types fantômes (`{} as ServiceType`) — jamais lus à runtime.
   * Utilisés uniquement pour l'inférence TypeScript.
   */
  readonly provides?: P;
}

/** Alias pratique pour un GwenPlugin sans contrainte sur N/P */
export type AnyGwenPlugin = GwenPlugin<string, Record<string, unknown>>;

// ── GwenPluginMeta ────────────────────────────────────────────────────────────

/**
 * Métadonnées statiques déclarées par un plugin GWEN.
 * Consommées par `gwen prepare` pour enrichir `.gwen/gwen.d.ts`.
 *
 * @example
 * ```ts
 * // Dans @gwen/plugin-html-ui/src/index.ts
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

// Surcharge 1 — objet direct (identique à aujourd'hui)
export function createPlugin<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
>(def: GwenPluginDef<N, P>): GwenPlugin<N, P>;

// Surcharge 2 — factory OBLIGATOIRE (args typés via unknown[], pas any[])
export function createPlugin<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
  Args extends unknown[] = [],
>(name: N, factory: (...args: Args) => GwenPluginBody<P>): GwenPluginFactory<N, P, Args>;

// Implémentation
export function createPlugin<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
  Args extends unknown[] = [],
>(
  nameOrDef: N | GwenPluginDef<N, P>,
  factory?: (...args: Args) => GwenPluginBody<P>,
): GwenPlugin<N, P> | GwenPluginFactory<N, P, Args> {
  if (typeof nameOrDef === 'string') {
    // Forme 2 — factory callable avec pluginName annoté
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
