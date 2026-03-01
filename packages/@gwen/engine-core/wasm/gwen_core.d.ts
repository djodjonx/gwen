/* tslint:disable */
/* eslint-disable */

/**
 * Main engine exported to JavaScript
 */
export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a raw-byte component to an entity.
     *
     * Uses **variable-size** mode: the column accepts any byte slice length
     * and performs an upsert (add-or-update). This is required because
     * TypeScript serialises components as JSON, so the byte length can
     * change between calls for the same component type.
     */
    add_component(index: number, generation: number, component_type_id: number, data: Uint8Array): boolean;
    /**
     * Get count of live entities
     */
    count_entities(): number;
    /**
     * Create a new entity. Returns a `JsEntityId` with both `index` and
     * `generation` – keep the whole object, not just the index.
     */
    create_entity(): JsEntityId;
    /**
     * Delete an entity. Requires the full `{index, generation}` pair so
     * that stale handles are correctly rejected.
     */
    delete_entity(index: number, generation: number): boolean;
    /**
     * Get delta time for current frame (in seconds)
     */
    delta_time(): number;
    /**
     * Get current frame number
     */
    frame_count(): bigint;
    /**
     * Get raw component bytes for an entity (returns empty Vec if not found).
     * On the TypeScript side, use a DataView over the returned Uint8Array.
     */
    get_component_raw(index: number, generation: number, component_type_id: number): Uint8Array;
    /**
     * Get the current generation for a slot index.
     * Returns u32::MAX if the index is out of bounds.
     * Used by the TS bridge to reconstruct packed EntityIds from query results.
     */
    get_entity_generation(index: number): number;
    /**
     * Check if entity has component
     */
    has_component(index: number, generation: number, component_type_id: number): boolean;
    /**
     * Check if entity is alive. Requires `{index, generation}` – returns
     * `false` for any stale handle whose generation no longer matches.
     */
    is_alive(index: number, generation: number): boolean;
    /**
     * Create a new engine instance
     */
    constructor(max_entities: number);
    /**
     * Query entities that have ALL the listed component types.
     * Returns a flat `Uint32Array` of entity indices.
     */
    query_entities(component_type_ids: Uint32Array): Uint32Array;
    /**
     * Register a new component type and return a unique numeric type ID.
     *
     * Each call returns a fresh, monotonically increasing ID.  Unlike the
     * native Rust API (which uses `std::any::TypeId`), this counter is
     * JS-friendly: callers just keep the returned number and pass it back.
     *
     * The actual column is created lazily on the first `add_component` call,
     * using the byte-slice length to determine the element size.
     */
    register_component_type(): number;
    /**
     * Remove a component from an entity.
     */
    remove_component(index: number, generation: number, component_type_id: number): boolean;
    /**
     * Remove an entity from the query system cache.
     * Must be called after delete_entity so the query system stops returning
     * the destroyed entity in subsequent queries.
     */
    remove_entity_from_query(index: number): void;
    /**
     * Reset frame timing
     */
    reset_frame(): void;
    /**
     * Check if should sleep for FPS capping
     */
    should_sleep(): boolean;
    /**
     * Get sleep time in milliseconds
     */
    sleep_time_ms(): number;
    /**
     * Get engine statistics as JSON string
     */
    stats(): string;
    /**
     * Update game loop (call every frame with delta in milliseconds)
     */
    tick(delta_ms: number): void;
    /**
     * Get total elapsed time (in seconds)
     */
    total_time(): number;
    /**
     * Update the archetype of an entity after component changes.
     * Pass the full list of component type IDs currently on the entity.
     */
    update_entity_archetype(index: number, component_type_ids: Uint32Array): void;
}

/**
 * Entity handle returned to JavaScript.
 * Carries both `index` and `generation` so JS can pass them back and
 * the engine can detect stale (dangling) references.
 */
export class JsEntityId {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Generation counter – incremented every time the slot is reused.
     * Use this to detect dangling references.
     */
    readonly generation: number;
    /**
     * Slot index (stable while entity lives and after slot is recycled)
     */
    readonly index: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_jsentityid_free: (a: number, b: number) => void;
    readonly jsentityid_index: (a: number) => number;
    readonly jsentityid_generation: (a: number) => number;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_new: (a: number) => number;
    readonly engine_create_entity: (a: number) => number;
    readonly engine_delete_entity: (a: number, b: number, c: number) => number;
    readonly engine_count_entities: (a: number) => number;
    readonly engine_is_alive: (a: number, b: number, c: number) => number;
    readonly engine_register_component_type: (a: number) => number;
    readonly engine_add_component: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly engine_remove_component: (a: number, b: number, c: number, d: number) => number;
    readonly engine_has_component: (a: number, b: number, c: number, d: number) => number;
    readonly engine_get_component_raw: (a: number, b: number, c: number, d: number) => [number, number];
    readonly engine_update_entity_archetype: (a: number, b: number, c: number, d: number) => void;
    readonly engine_remove_entity_from_query: (a: number, b: number) => void;
    readonly engine_get_entity_generation: (a: number, b: number) => number;
    readonly engine_query_entities: (a: number, b: number, c: number) => [number, number];
    readonly engine_tick: (a: number, b: number) => void;
    readonly engine_frame_count: (a: number) => bigint;
    readonly engine_delta_time: (a: number) => number;
    readonly engine_total_time: (a: number) => number;
    readonly engine_should_sleep: (a: number) => number;
    readonly engine_sleep_time_ms: (a: number) => number;
    readonly engine_reset_frame: (a: number) => void;
    readonly engine_stats: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
