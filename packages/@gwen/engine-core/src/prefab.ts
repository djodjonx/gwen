/**
 * GWEN Prefab System
 *
 * Declarative entity assembly. "Humanizes" ECS by allowing developers to
 * define reusable entity templates (Prefabs) and spawn them by name.
 *
 * @example
 * ```typescript
 * import { definePrefab } from '@gwen/engine-core';
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

import type { EngineAPI } from './types';
import type { EntityId } from './ecs';

export interface PrefabDefinition<Args extends any[] = any[]> {
  /** Unique name of the prefab */
  readonly name: string;
  /** Factory function that assembles the entity */
  create: (api: EngineAPI, ...args: Args) => EntityId;
}

/** Corps d'un PrefabDefinition sans le `name` — utilisé par la forme factory. */
export type PrefabBody<Args extends any[] = any[]> = Omit<PrefabDefinition<Args>, 'name'>;

/**
 * Définit un Prefab GWEN — deux syntaxes supportées.
 *
 * **Forme 1 — objet direct** :
 * ```ts
 * export const PlayerPrefab = definePrefab({
 *   name: 'Player',
 *   create: (api) => { ... }
 * });
 * ```
 *
 * **Forme 2 — factory** (état local en closure) :
 * ```ts
 * export const EnemyPrefab = definePrefab('Enemy', () => {
 *   const baseSpeed = 80;
 *   return {
 *     create: (api, x: number, y: number) => { ... }
 *   };
 * });
 * ```
 */
// Surcharge 1 — objet direct
export function definePrefab<Args extends any[]>(
  config: PrefabDefinition<Args>,
): PrefabDefinition<Args>;

// Surcharge 2 — factory OBLIGATOIRE
export function definePrefab<Args extends any[]>(
  name: string,
  factory: () => PrefabBody<Args>,
): PrefabDefinition<Args>;

// Implémentation
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
  private _api!: EngineAPI;

  /** @internal */
  _setAPI(api: EngineAPI): void {
    this._api = api;
  }

  /** Register a Prefab definition */
  register<Args extends any[]>(def: PrefabDefinition<Args>): this {
    if (this.registry.has(def.name)) {
      console.warn(`[GWEN:PrefabManager] Prefab '${def.name}' already registered — overwriting.`);
    }
    this.registry.set(def.name, def);
    return this;
  }

  /** Instantiate a registered Prefab by name, passing optional arguments */
  instantiate(name: string, ...args: any[]): EntityId {
    const def = this.registry.get(name);
    if (!def) {
      throw new Error(`[GWEN:PrefabManager] Unknown prefab '${name}'. Did you call register()?`);
    }
    return def.create(this._api, ...args);
  }

  /** Check if a prefab is registered */
  has(name: string): boolean {
    return this.registry.has(name);
  }

  /** Remove all registered prefabs */
  clear(): void {
    this.registry.clear();
  }
}
