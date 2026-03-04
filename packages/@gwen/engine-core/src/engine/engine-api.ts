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

// EntityId is now a packed number (index | generation<<20) aligned with Rust format
export type EntityId = number;

// ── Packed EntityId helpers ────────────────────────────────────────────────────

/**
 * Pack a WASM entity handle into a single 32-bit integer:
 * `(generation << 20) | (index & 0xFFFFF)`.
 *
 * This matches the Rust-side encoding so IDs can be compared across the boundary.
 *
 * @param wasmId Raw `{index, generation}` pair returned by `WasmBridge.createEntity()`.
 * @returns Packed `EntityId`.
 */
export function packId(wasmId: { index: number; generation: number }): EntityId {
  return (wasmId.generation << 20) | (wasmId.index & 0xfffff);
}

/**
 * Unpack a packed `EntityId` back to its `{index, generation}` components.
 * Inverse of `packId`.
 *
 * @param id Packed entity handle.
 */
export function unpackId(id: EntityId): { index: number; generation: number } {
  return { index: id & 0xfffff, generation: id >>> 20 };
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
  get<T>(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType): T | undefined;
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
      const { index, generation } = unpackId(id);
      return wasmBridge.deleteEntity(index, generation);
    },
    isAlive: (id: EntityId) => {
      const { index, generation } = unpackId(id);
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
      const typeId = engine._getComponentTypeId(type);
      if (typeId === undefined) return false;
      const { index, generation } = unpackId(id);
      const ok = wasmBridge.removeComponent(index, generation, typeId);
      if (ok) {
        wasmBridge.updateEntityArchetype(index, engine._getEntityTypeIds(id));
      }
      return ok;
    },
    get: <T>(
      id: EntityId,
      type: ComponentDefinition<ComponentSchema> | ComponentType,
    ): T | undefined => {
      const typeName = typeof type === 'string' ? type : type.name;
      const typeId = engine._getComponentTypeId(typeName);
      if (typeId === undefined) return undefined;
      const { index, generation } = unpackId(id);
      const raw = wasmBridge.getComponentRaw(index, generation, typeId);
      if (raw.length === 0) return undefined;
      return engine._deserializeComponent(typeName, raw) as T;
    },
    has: (id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType) => {
      const typeName = typeof type === 'string' ? type : type.name;
      const typeId = engine._getComponentTypeId(typeName);
      if (typeId === undefined) return false;
      const { index, generation } = unpackId(id);
      return wasmBridge.hasComponent(index, generation, typeId);
    },
    removeAll: (id: EntityId) => {
      const { index, generation } = unpackId(id);
      const componentTypeIds = engine._getComponentTypeIds();
      for (const [, typeId] of componentTypeIds) {
        wasmBridge.removeComponent(index, generation, typeId);
      }
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
