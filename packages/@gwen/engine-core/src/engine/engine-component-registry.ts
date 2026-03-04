/**
 * Engine Component Registry — TypeScript ↔ Rust component type ID mapping.
 *
 * Every ECS component type has a string name on the TS side (e.g. `'Transform'`)
 * and a numeric ID on the Rust side (assigned by `register_component_type()`).
 *
 * This registry owns the bidirectional mapping and provides helpers to:
 * - Register a new type (lazy — on first use)
 * - Look up the numeric ID for a type name
 * - Collect all type IDs currently attached to an entity
 *
 * @internal Used exclusively by the Engine class.
 */

import type { ComponentType } from '../types';
import type { WasmBridge } from './wasm-bridge';
import { unpackId, type EntityId } from './engine-api';

export class EngineComponentRegistry {
  /** TS component name → Rust numeric typeId */
  private typeIds = new Map<ComponentType, number>();

  constructor(private readonly wasmBridge: WasmBridge) {}

  // ── Registration ─────────────────────────────────────────────────────────────

  /**
   * Get the Rust typeId for a component type name.
   * Registers a new ID with the WASM core if this is the first use.
   */
  getOrRegister(type: ComponentType): number {
    let typeId = this.typeIds.get(type);
    if (typeId === undefined) {
      typeId = this.wasmBridge.registerComponentType();
      this.typeIds.set(type, typeId);
    }
    return typeId;
  }

  /**
   * Get the Rust typeId for a component type name, or `undefined` if not yet registered.
   * Use this when you need to distinguish "not registered" from "registered with ID 0".
   */
  get(type: ComponentType): number | undefined {
    return this.typeIds.get(type);
  }

  /**
   * Read-only view of the full type map.
   * Exposed for shims and advanced introspection — do not mutate.
   */
  getAll(): ReadonlyMap<ComponentType, number> {
    return this.typeIds;
  }

  // ── Entity helpers ───────────────────────────────────────────────────────────

  /**
   * Collect all Rust typeIds currently attached to an entity.
   * Used to rebuild the archetype bitmask after add/remove operations.
   */
  getEntityTypeIds(id: EntityId): number[] {
    const { index, generation } = unpackId(id);
    const result: number[] = [];
    for (const [, typeId] of this.typeIds) {
      if (this.wasmBridge.hasComponent(index, generation, typeId)) {
        result.push(typeId);
      }
    }
    return result;
  }
}
