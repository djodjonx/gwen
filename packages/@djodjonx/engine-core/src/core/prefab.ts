/**
 * GWEN Prefab System
 *
 * Declarative entity assembly. "Humanizes" ECS by allowing developers to
 * define reusable entity templates (Prefabs) and spawn them by name.
 *
 * @example
 * ```typescript
 * import { definePrefab } from '@djodjonx/gwen-engine-core';
 *
 * const BulletPrefab = definePrefab({
 *   name: 'Bullet',
 *   create: (api, x: number, y: number) => {
 *     const id = api.createEntity();
 *     api.addComponent(id, Position, { x, y });
 *     api.addComponent(id, Velocity, { vx: 0, vy: -500 });
 *     return id;
 *   }
 * });
 *
 * // In a system:
 * api.prefabs.register(BulletPrefab);
 * const bulletId = api.prefabs.instantiate('Bullet', 100, 200);
 * ```
 */

import type { EngineAPI } from '../types';
import type { EntityId } from '../engine/engine-api';

export interface PrefabDefinition<Args extends any[] = any[]> {
  /** Unique name of the prefab */
  readonly name: string;
  /** Factory function that assembles the entity */
  create: (api: EngineAPI, ...args: Args) => EntityId;
}

/**
 * Body of a PrefabDefinition without the `name` — used by factory form.
 */
export type PrefabBody<Args extends any[] = any[]> = Omit<PrefabDefinition<Args>, 'name'>;

/**
 * Define a GWEN Prefab — two syntaxes supported.
 *
 * **Form 1 — direct object**:
 * ```ts
 * export const PlayerPrefab = definePrefab({
 *   name: 'Player',
 *   create: (api) => { ... }
 * });
 * ```
 *
 * **Form 2 — factory** (local state in closure):
 * ```ts
 * export const EnemyPrefab = definePrefab('Enemy', () => {
 *   const baseSpeed = 80;
 *   return {
 *     create: (api, x: number, y: number) => { ... }
 *   };
 * });
 * ```
 */

/**
 * Form 1 — pass a full `PrefabDefinition` object directly.
 *
 * @param config Full prefab definition including `name` and `create`.
 * @returns The same definition, unchanged.
 */
export function definePrefab<Args extends any[]>(
  config: PrefabDefinition<Args>,
): PrefabDefinition<Args>;

/**
 * Form 2 — factory with local closure state.
 *
 * @param name    Unique prefab name.
 * @param factory Zero-arg factory that returns the prefab body (without `name`).
 * @returns The resolved `PrefabDefinition`.
 */
export function definePrefab<Args extends any[]>(
  name: string,
  factory: () => PrefabBody<Args>,
): PrefabDefinition<Args>;

export function definePrefab<Args extends any[]>(
  nameOrConfig: string | PrefabDefinition<Args>,
  factory?: () => PrefabBody<Args>,
): PrefabDefinition<Args> {
  if (typeof nameOrConfig === 'string') {
    return { name: nameOrConfig, ...factory!() };
  }
  return nameOrConfig;
}

/**
 * Manages prefab registration and instantiation.
 * Exposed as `api.prefabs`.
 */
export class PrefabManager {
  private registry = new Map<string, PrefabDefinition<any>>();

  // Internal reference to the API, set by EngineAPIImpl during construction
  private _api!: EngineAPI<any, any>;

  /**
   * Bind the `EngineAPI` instance to this manager so that `instantiate()` can
   * pass it to the prefab's `create()` function.
   *
   * @param api Active engine API.
   * @internal Called by `EngineAPIImpl` constructor.
   */
  _setAPI<M extends Record<string, unknown>, H extends Record<string, any>>(
    api: EngineAPI<M, H>,
  ): void {
    this._api = api;
  }

  /**
   * Register a prefab definition.
   * Overwrites any existing registration with the same name (with a warning).
   *
   * @param def The prefab to register.
   * @returns `this` for chaining.
   */
  register<Args extends any[]>(def: PrefabDefinition<Args>): this {
    if (this.registry.has(def.name)) {
      console.warn(`[GWEN:PrefabManager] Prefab '${def.name}' already registered — overwriting.`);
    }
    this.registry.set(def.name, def);
    return this;
  }

  /**
   * Instantiate a registered prefab by name.
   * Calls the prefab's `create()` function with the current `EngineAPI` plus
   * any additional arguments.
   *
   * @param name   Prefab name (as declared in `PrefabDefinition.name`).
   * @param args   Additional arguments forwarded to `create()`.
   * @returns The packed `EntityId` of the newly created entity.
   * @throws {Error} If no prefab with the given name is registered.
   */
  instantiate(name: string, ...args: unknown[]): EntityId {
    const def = this.registry.get(name);
    if (!def) {
      throw new Error(`[GWEN:PrefabManager] Unknown prefab '${name}'. Did you call register()?`);
    }
    return def.create(this._api, ...args);
  }

  /**
   * Return `true` if a prefab with the given name is registered.
   *
   * @param name Prefab name.
   */
  has(name: string): boolean {
    return this.registry.has(name);
  }

  /** Remove all registered prefabs. Useful between scene transitions. */
  clear(): void {
    this.registry.clear();
  }
}
