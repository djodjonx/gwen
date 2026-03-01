/**
 * GWEN Plugin System — typed plugin declaration
 *
 * `createPlugin()` permet de déclarer un plugin avec ses services exposés.
 * Le type `GwenPlugin<N, P>` enrichit `TsPlugin` avec :
 *  - `name` littéral (pour la discrimination de type)
 *  - `provides` : map des services que le plugin injecte dans le ServiceLocator
 *
 * ```typescript
 * // Déclaration d'un plugin typé
 * export const InputPlugin = createPlugin({
 *   name: 'InputPlugin' as const,
 *   provides: {
 *     keyboard: {} as KeyboardInput,
 *     mouse:    {} as MouseInput,
 *   },
 *   onInit(api) {
 *     api.services.register('keyboard', new KeyboardInput());
 *   },
 * });
 *
 * // Dans gwen.config.ts — autocomplétion sur les services
 * const config = defineConfig({
 *   plugins: [new InputPlugin()],
 * });
 * // config.api.services.get('keyboard') → KeyboardInput ✅
 * // config.api.services.get('audio')    → TS error ❌
 * ```
 */

import type { TsPlugin, EngineAPI } from './types';

// ── Types utilitaires ─────────────────────────────────────────────────────────

/** Convertit une union en intersection : A | B | C → A & B & C */
export type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

/** Extrait le type `provides` d'un GwenPlugin */
export type PluginProvides<T> =
  T extends GwenPlugin<any, infer P> ? P : Record<string, never>;

/** Fusionne les `provides` de tous les plugins d'une liste */
export type MergeProvides<Plugins extends readonly AnyGwenPlugin[]> =
  UnionToIntersection<PluginProvides<Plugins[number]>>;

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

// ── createPlugin() ────────────────────────────────────────────────────────────

/** Définition passée à createPlugin() */
export interface GwenPluginDef<
  N extends string,
  P extends Record<string, unknown>,
> {
  readonly name: N;
  readonly provides?: P;
  onInit?(api: EngineAPI): void;
  onBeforeUpdate?(api: EngineAPI, deltaTime: number): void;
  onUpdate?(api: EngineAPI, deltaTime: number): void;
  onRender?(api: EngineAPI): void;
  onDestroy?(): void;
}

/**
 * Crée un plugin GWEN typé.
 *
 * ```typescript
 * export const MyPlugin = createPlugin({
 *   name: 'MyPlugin' as const,
 *   provides: { myService: {} as MyService },
 *   onInit(api) {
 *     api.services.register('myService', new MyService());
 *   },
 * });
 * ```
 */
export function createPlugin<
  N extends string,
  P extends Record<string, unknown> = Record<string, never>,
>(def: GwenPluginDef<N, P>): GwenPlugin<N, P> {
  return def as GwenPlugin<N, P>;
}

