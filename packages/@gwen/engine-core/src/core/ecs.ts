/**
 * ECS — Entity Component System (TypeScript)
 *
 * Pure TS implementation mirroring the Rust/WASM core logic.
 * Uses the same patterns: generation counter, free list, SoA-style storage.
 */

import type { ComponentDefinition } from '../schema';

// ============= Entity Manager =============

/**
 * Packed entity ID: lower 20 bits = index, upper 12 bits = generation.
 * Allows detecting stale references (use-after-free).
 */
export type EntityId = number;

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1; // 0xFFFFF
const GEN_SHIFT = INDEX_BITS;

function makeId(index: number, generation: number): EntityId {
  return (generation << GEN_SHIFT) | (index & INDEX_MASK);
}

function idIndex(id: EntityId): number {
  return id & INDEX_MASK;
}

function idGeneration(id: EntityId): number {
  return id >>> GEN_SHIFT;
}

export class EntityManager {
  private generations: Uint16Array;
  private alive: Uint8Array; // 1 = alive, 0 = dead
  private freeList: number[] = [];
  private liveCount = 0;
  readonly maxEntities: number;

  constructor(maxEntities: number) {
    this.maxEntities = maxEntities;
    this.generations = new Uint16Array(maxEntities);
    this.alive = new Uint8Array(maxEntities);
  }

  /** Create a new entity. Returns its EntityId. Throws if at capacity. */
  create(): EntityId {
    let index: number;

    if (this.freeList.length > 0) {
      index = this.freeList.pop()!;
    } else {
      index = this.liveCount;
      if (index >= this.maxEntities) {
        throw new Error(`[ECS] Entity capacity exceeded (max: ${this.maxEntities})`);
      }
    }

    const gen = this.generations[index];
    this.alive[index] = 1;
    this.liveCount++;
    return makeId(index, gen);
  }

  /** Destroy an entity. Returns true if it was alive. */
  destroy(id: EntityId): boolean {
    const index = idIndex(id);
    const gen = idGeneration(id);

    if (!this.isAlive(id)) return false;

    this.alive[index] = 0;
    // Increment generation to invalidate all old references
    this.generations[index] = (gen + 1) & 0xffff;
    this.freeList.push(index);
    this.liveCount--;
    return true;
  }

  /** Check if entity is still alive (validates generation). */
  isAlive(id: EntityId): boolean {
    const index = idIndex(id);
    const gen = idGeneration(id);
    if (index >= this.maxEntities) return false;
    return this.alive[index] === 1 && this.generations[index] === gen;
  }

  /** Number of currently alive entities. */
  count(): number {
    return this.liveCount;
  }

  /** Iterate over all alive entity IDs. */
  *[Symbol.iterator](): Iterator<EntityId> {
    for (let i = 0; i < this.maxEntities; i++) {
      if (this.alive[i] === 1) {
        yield makeId(i, this.generations[i]);
      }
    }
  }
}

// ============= Component Registry =============

export type ComponentType = string;

/**
 * Stores all component data keyed by EntityId index.
 * Each component type has its own Map for cache efficiency.
 */
export class ComponentRegistry {
  // componentType → (entityIndex → data)
  private storage = new Map<ComponentType, Map<number, unknown>>();

  /** Register a new component type (idempotent). */
  register(type: ComponentType): void {
    if (!this.storage.has(type)) {
      this.storage.set(type, new Map());
    }
  }

  /** Add or update a component on an entity. */
  add<T>(entityId: EntityId, type: ComponentType | ComponentDefinition<any>, data: T): void {
    const key = typeof type === 'string' ? type : type.name;
    if (!this.storage.has(key)) {
      this.storage.set(key, new Map());
    }
    this.storage.get(key)!.set(idIndex(entityId), data);
  }

  /** Remove a component from an entity. Returns true if it existed. */
  remove(entityId: EntityId, type: ComponentType | ComponentDefinition<any>): boolean {
    const key = typeof type === 'string' ? type : type.name;
    const map = this.storage.get(key);
    if (!map) return false;
    return map.delete(idIndex(entityId));
  }

  /** Get a component by entity and type. Returns undefined if absent. */
  get<T>(entityId: EntityId, type: ComponentType | ComponentDefinition<any>): T | undefined {
    const key = typeof type === 'string' ? type : type.name;
    return this.storage.get(key)?.get(idIndex(entityId)) as T | undefined;
  }

  /** Check if an entity has a component. */
  has(entityId: EntityId, type: ComponentType | ComponentDefinition<any>): boolean {
    const key = typeof type === 'string' ? type : type.name;
    return this.storage.get(key)?.has(idIndex(entityId)) ?? false;
  }

  /** Remove all components for a given entity (called on entity destroy). */
  removeAll(entityId: EntityId): void {
    const index = idIndex(entityId);
    for (const map of this.storage.values()) {
      map.delete(index);
    }
  }

  /** All registered component types. */
  registeredTypes(): ComponentType[] {
    return [...this.storage.keys()];
  }
}

// ============= Query Engine =============

/**
 * Finds entities that have ALL required component types.
 * Caches results and invalidates on component mutations.
 */
export class QueryEngine {
  private cache = new Map<string, EntityId[]>();
  private dirty = true;

  invalidate(): void {
    this.dirty = true;
    this.cache.clear();
  }

  /**
   * Return all entities (from EntityManager) that have ALL required types.
   * Results are cached until next invalidation.
   */
  query(
    required: ComponentType[],
    entities: EntityManager,
    components: ComponentRegistry,
  ): EntityId[] {
    if (required.length === 0) {
      // Return all alive entities
      return [...entities];
    }

    const cacheKey = [...required].sort().join('|');

    if (!this.dirty && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const results: EntityId[] = [];
    for (const id of entities) {
      if (required.every((type) => components.has(id, type))) {
        results.push(id);
      }
    }

    this.cache.set(cacheKey, results);
    this.dirty = false;
    return results;
  }
}
