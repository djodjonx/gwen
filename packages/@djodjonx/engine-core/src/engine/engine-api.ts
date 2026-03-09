/**
 * GWEN Engine API Creation & Shims
 *
 * Helpers for creating the engine API and satisfying the ECS interfaces.
 * Exports EntityId packing/unpacking utilities and shim factories.
 * @internal
 */

import type { ComponentDefinition, ComponentSchema } from '../schema';
import type { EntityManager, ComponentRegistry, QueryEngine } from '../core/ecs';
import type { ComponentType } from '../types';
import type { Engine } from './engine';
import { createEntityId, unpackEntityId, type EntityId } from '../types/entity';

// ── EntityId Re-exports ────────────────────────────────────────────────────────
// EntityId and helpers are defined in types/entity.ts (foundational layer)
// We re-export them here for backward compatibility with code that imports from engine-api

export { createEntityId, unpackEntityId, type EntityId } from '../types/entity';

/**

/**
 * Check structural equality of two EntityIds.
 *
 * Uses === comparison on the underlying bigint primitives.
 * This is safe because EntityIds are created via `createEntityId()` or
 * internal WASM bridge calls, ensuring uniqueness.
 *
 * @param a - First EntityId
 * @param b - Second EntityId
 * @returns `true` if both IDs represent the same entity slot + generation
 *
 * @example
 * ```typescript
 * if (entityIdEqual(id1, id2)) {
 *   // Same entity
 * }
 * ```
 */
export function entityIdEqual(a: EntityId, b: EntityId): boolean {
  return a === b;
}

/**
 * Serialize an EntityId to a stable string representation.
 *
 * Format: `"${index}:${generation}"` (e.g., `"5:100"`)
 *
 * Useful for:
 * - JSON serialization
 * - Storage keys
 * - Debug logging
 * - Human-readable output
 *
 * @param id - The EntityId to serialize
 * @returns String in format `"index:generation"`
 *
 * @example
 * ```typescript
 * const str = entityIdToString(id); // "5:100"
 * ```
 */
export function entityIdToString(id: EntityId): string {
  const { index, generation } = unpackEntityId(id);
  return `${index}:${generation}`;
}

/**
 * Deserialize an EntityId from a string representation.
 *
 * Inverse of `entityIdToString()`.
 *
 * @param str - String in format `"index:generation"` (e.g., `"5:100"`)
 * @returns The reconstructed EntityId
 *
 * @throws Throws if format is invalid or numbers cannot be parsed
 *
 * @example
 * ```typescript
 * const id = entityIdFromString("5:100");
 * ```
 */
export function entityIdFromString(str: string): EntityId {
  const [indexStr, generationStr] = str.split(':');
  const index = Number.parseInt(indexStr, 10);
  const generation = Number.parseInt(generationStr, 10);

  if (Number.isNaN(index) || Number.isNaN(generation)) {
    throw new Error(
      `Invalid EntityId string format: "${str}". Expected "index:generation" ` +
        `where both are valid integers.`,
    );
  }

  return createEntityId(index, generation);
}

/**
 * Pack a WASM entity handle — DEPRECATED, use `createEntityId()` instead.
 *
 * @deprecated Use {@link createEntityId} — this is maintained for backward compatibility only.
 *
 * @param wasmId - Raw `{index, generation}` pair
 * @returns EntityId
 */
export function packId(wasmId: { index: number; generation: number }): EntityId {
  return createEntityId(wasmId.index, wasmId.generation);
}

/**
 * Unpack a packed EntityId — DEPRECATED, use `unpackEntityId()` instead.
 *
 * @deprecated Use {@link unpackEntityId} — this is maintained for backward compatibility only.
 *
 * @param id - EntityId to unpack
 * @returns Raw components
 */
export function unpackId(id: EntityId): { index: number; generation: number } {
  return unpackEntityId(id);
}

// ── Internal types ─────────────────────────────────────────────────────────────

/** Possible JavaScript value for a serialized component field. */
export type ComponentFieldValue = number | bigint | boolean | string;

// ── WASM shim interfaces ──────────────────────────────────────────────────────

/**
 * Shim that satisfies the `EntityManager` interface expected by `createEngineAPI`.
 * Delegates all operations to the WASM bridge — no TypeScript array backing store.
 * @internal
 */
interface EntityManagerShim extends Pick<EntityManager, 'count' | 'maxEntities'> {
  create(): EntityId;
  destroy(id: EntityId): boolean;
  isAlive(id: EntityId): boolean;
  getGeneration(slotIndex: number): number;
  [Symbol.iterator](): Iterator<EntityId>;
}

/**
 * Shim that satisfies the `ComponentRegistry` interface expected by `createEngineAPI`.
 * Serializes component data and delegates storage to the WASM bridge.
 * @internal
 */
interface ComponentRegistryShim extends Pick<ComponentRegistry, 'removeAll' | 'registeredTypes'> {
  add<T>(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType, data: T): void;
  remove(id: EntityId, type: ComponentType): boolean;
  get<T extends Record<string, ComponentFieldValue>>(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): T | undefined;
  has(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType): boolean;
}

/**
 * Shim that satisfies the `QueryEngine` interface expected by `createEngineAPI`.
 * Delegates to `WasmBridge.queryEntities` — invalidation is handled by WASM.
 * @internal
 */
interface QueryEngineShim extends Pick<QueryEngine, 'invalidate'> {
  query(
    required: ComponentType[],
    entities: EntityManagerShim,
    components: ComponentRegistryShim,
  ): EntityId[];
}

// ── Shim Factory ─────────────────────────────────────────────────────────────

/**
 * Create the three shims (entity, component, query) for the Engine.
 * These adapt the WASM bridge to satisfy the TypeScript ECS interfaces.
 * @internal
 */
export function createShims(engine: Engine): {
  entityShim: EntityManagerShim;
  componentShim: ComponentRegistryShim;
  queryShim: QueryEngineShim;
} {
  const wasmBridge = engine._getWasmBridge();
  const config = engine.getConfig();

  const entityShim: EntityManagerShim = {
    create: () => {
      const wid = wasmBridge.createEntity();
      return packId(wid);
    },
    destroy: (id: EntityId) => {
      return engine._destroyEntityInternal(id);
    },
    isAlive: (id: EntityId) => {
      const { index, generation } = unpackEntityId(id);
      return wasmBridge.isAlive(index, generation);
    },
    getGeneration: (slotIndex: number) => {
      return wasmBridge.getEntityGeneration(slotIndex);
    },
    count: () => wasmBridge.countEntities(),
    maxEntities: config.maxEntities,
    [Symbol.iterator]: function* () {
      /* queries via bridge */
    },
  };

  const componentShim: ComponentRegistryShim = {
    add: <T>(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType, data: T) => {
      engine._addComponentInternal(id, type, data);
    },
    remove: (id: EntityId, type: ComponentType) => {
      return engine._removeComponentInternal(id, type);
    },
    get: <T extends Record<string, ComponentFieldValue>>(
      id: EntityId,
      type: ComponentDefinition<ComponentSchema> | ComponentType,
    ): T | undefined => {
      return engine.getComponent<T>(id, type);
    },
    has: (id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType) => {
      return engine.hasComponent(id, type);
    },
    removeAll: (id: EntityId) => {
      engine._removeAllComponentsInternal(id);
    },
    registeredTypes: () => {
      const componentTypeIds = engine._getComponentTypeIds();
      return [...componentTypeIds.keys()];
    },
  };

  const queryShim: QueryEngineShim = {
    query: (required: ComponentType[]) => {
      const typeIds = required.map((t) => engine._getOrRegisterTypeId(t));
      return wasmBridge.queryEntities(typeIds);
    },
    invalidate: () => {
      /* handled by WASM */
    },
  };

  return { entityShim, componentShim, queryShim };
}
