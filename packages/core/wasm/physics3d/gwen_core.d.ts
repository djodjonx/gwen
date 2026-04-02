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
  add_component(
    index: number,
    generation: number,
    component_type_id: number,
    data: Uint8Array,
  ): boolean;
  /**
   * Allocates `byte_length` bytes in the WASM linear memory and returns
   * the raw pointer (as usize) to that region.
   *
   * Called once by `SharedMemoryManager.create()` in TypeScript to carve
   * out a shared buffer that plugin WASM modules can read/write directly.
   *
   * Layout contract (stride = 32 bytes per entity slot):
   *   offset +  0 : pos_x    (f32)
   *   offset +  4 : pos_y    (f32)
   *   offset +  8 : rotation (f32)
   *   offset + 12 : scale_x  (f32)
   *   offset + 16 : scale_y  (f32)
   *   offset + 20 : flags    (u32)  — bit 0: physics active, bit 1: dirty
   *   offset + 24 : reserved (8 bytes)
   *
   * # Safety
   * The returned pointer is valid for the lifetime of the WASM module.
   * TypeScript must not access it after the engine is destroyed.
   */
  alloc_shared_buffer(byte_length: number): number;
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
   * Get the number of transforms marked as dirty.
   */
  dirty_transform_count(): number;
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
   * Get a raw pointer to the static query result buffer.
   *
   * Use this to read the results of the last `query_entities_to_buffer` call
   * from JavaScript without allocations.
   */
  get_query_result_ptr(): number;
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
   * Register a new 3D rigid body for the given entity index.
   *
   * Returns `false` if the entity index is already registered (no-op).
   *
   * # Arguments
   * * `entity_index`    — ECS entity slot index.
   * * `x`, `y`, `z`    — Initial world-space position.
   * * `kind`            — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
   * * `mass`            — Body mass in kg (dynamic bodies only).
   * * `linear_damping`  — Linear velocity damping coefficient.
   * * `angular_damping` — Angular velocity damping coefficient.
   */
  physics3d_add_body(
    entity_index: number,
    x: number,
    y: number,
    z: number,
    kind: number,
    mass: number,
    linear_damping: number,
    angular_damping: number,
  ): boolean;
  /**
   * Attach an axis-aligned box collider to a 3D body.
   *
   * Returns `false` if the entity has no registered body or the world is not
   * initialised.
   *
   * # Arguments
   * * `entity_index`    — ECS entity slot index.
   * * `half_x/y/z`     — Box half-extents (metres).
   * * `offset_x/y/z`   — Local-space offset from the body origin.
   * * `is_sensor`       — If `true`, collision response is suppressed; only events fire.
   * * `friction`        — Surface friction coefficient (≥ 0).
   * * `restitution`     — Bounciness coefficient (\[0, 1\]).
   * * `layer_bits`      — Collision layer membership bitmask.
   * * `mask_bits`       — Collision filter bitmask (which layers this collider hits).
   * * `collider_id`     — Stable application-defined ID stored in collision events.
   */
  physics3d_add_box_collider(
    entity_index: number,
    half_x: number,
    half_y: number,
    half_z: number,
    offset_x: number,
    offset_y: number,
    offset_z: number,
    is_sensor: boolean,
    friction: number,
    restitution: number,
    layer_bits: number,
    mask_bits: number,
    collider_id: number,
  ): boolean;
  /**
   * Attach a Y-axis capsule collider to a 3D body.
   *
   * The capsule extends `±half_height` metres along the Y axis, capped by
   * hemispheres of `radius` metres.
   *
   * Returns `false` if the entity has no registered body or the world is not
   * initialised.
   *
   * # Arguments
   * * `entity_index`    — ECS entity slot index.
   * * `radius`          — Hemisphere radius (metres).
   * * `half_height`     — Half-length of the cylindrical shaft (metres).
   * * `offset_x/y/z`   — Local-space offset from the body origin.
   * * `is_sensor`       — If `true`, collision response is suppressed; only events fire.
   * * `friction`        — Surface friction coefficient (≥ 0).
   * * `restitution`     — Bounciness coefficient (\[0, 1\]).
   * * `layer_bits`      — Collision layer membership bitmask.
   * * `mask_bits`       — Collision filter bitmask.
   * * `collider_id`     — Stable application-defined ID stored in collision events.
   */
  physics3d_add_capsule_collider(
    entity_index: number,
    radius: number,
    half_height: number,
    offset_x: number,
    offset_y: number,
    offset_z: number,
    is_sensor: boolean,
    friction: number,
    restitution: number,
    layer_bits: number,
    mask_bits: number,
    collider_id: number,
  ): boolean;
  /**
   * Attach a sphere collider to a 3D body.
   *
   * Returns `false` if the entity has no registered body or the world is not
   * initialised.
   *
   * # Arguments
   * * `entity_index`    — ECS entity slot index.
   * * `radius`          — Sphere radius (metres).
   * * `offset_x/y/z`   — Local-space offset from the body origin.
   * * `is_sensor`       — If `true`, collision response is suppressed; only events fire.
   * * `friction`        — Surface friction coefficient (≥ 0).
   * * `restitution`     — Bounciness coefficient (\[0, 1\]).
   * * `layer_bits`      — Collision layer membership bitmask.
   * * `mask_bits`       — Collision filter bitmask.
   * * `collider_id`     — Stable application-defined ID stored in collision events.
   */
  physics3d_add_sphere_collider(
    entity_index: number,
    radius: number,
    offset_x: number,
    offset_y: number,
    offset_z: number,
    is_sensor: boolean,
    friction: number,
    restitution: number,
    layer_bits: number,
    mask_bits: number,
    collider_id: number,
  ): boolean;
  /**
   * Apply a world-space angular (torque) impulse to a 3D body.
   *
   * Immediately changes the body's angular velocity. Wakes the body if
   * sleeping. Returns `false` if the entity has no body or the world is
   * not initialised.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `ax/ay/az`     — Angular impulse vector (N·m·s).
   */
  physics3d_apply_angular_impulse(
    entity_index: number,
    ax: number,
    ay: number,
    az: number,
  ): boolean;
  /**
   * Apply a world-space linear impulse to a 3D body.
   *
   * Wakes the body if sleeping. Returns `false` if the entity has no body.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `ix/iy/iz`     — Impulse vector (N·s).
   */
  physics3d_apply_impulse(entity_index: number, ix: number, iy: number, iz: number): boolean;
  /**
   * Clear all pending 3D collision events.
   *
   * Call after JavaScript has finished reading the event buffer. The next
   * [`physics3d_step`] call also implicitly clears the buffer.
   *
   * No-op if the world is not initialised.
   */
  physics3d_consume_events(): void;
  /**
   * Return the angular velocity of a 3D body as `[ax, ay, az]` (rad/s).
   *
   * Returns an empty array if the entity has no body.
   */
  physics3d_get_angular_velocity(entity_index: number): Float32Array;
  /**
   * Return the body kind discriminant for a 3D body.
   *
   * Returns `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased,
   * or `255` if the entity has no registered body.
   */
  physics3d_get_body_kind(entity_index: number): number;
  /**
   * Return the full body state as a flat `Float32Array` of 13 elements.
   *
   * Layout: `[px, py, pz, qx, qy, qz, qw, vx, vy, vz, ax, ay, az]`
   *
   * Returns an empty array if the entity has no body or the world is not
   * initialised.
   */
  physics3d_get_body_state(entity_index: number): Float32Array;
  /**
   * Return the number of 3D collision events written since the last step.
   *
   * Returns `0` if the world is not initialised.
   */
  physics3d_get_collision_event_count(): number;
  /**
   * Return a raw pointer to the 3D collision event ring buffer.
   *
   * The buffer lives in WASM linear memory and remains valid for the
   * lifetime of the module. JavaScript should wrap the result in a typed
   * array view of length `physics3d_get_collision_event_count() * EVENT_STRIDE_3D`.
   *
   * Returns `0` if the world is not initialised.
   */
  physics3d_get_collision_events_ptr(): number;
  /**
   * Return the linear velocity of a 3D body as `[vx, vy, vz]`.
   *
   * Returns an empty array if the entity has no body.
   */
  physics3d_get_linear_velocity(entity_index: number): Float32Array;
  /**
   * Return the sensor state for a 3D collider as a packed `u64`.
   *
   * Bit layout: `bits 0–31 = contact_count (u32)`, `bit 32 = is_active (bool)`.
   * Returns `0` if no state has been recorded or the world is not initialised.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `sensor_id`    — Stable collider ID used when the sensor was created.
   */
  physics3d_get_sensor_state(entity_index: number, sensor_id: number): bigint;
  /**
   * Return `true` if a 3D body is registered for the given entity index.
   */
  physics3d_has_body(entity_index: number): boolean;
  physics3d_init(gx: number, gy: number, gz: number, _max_entities: number): void;
  /**
   * Remove the 3D rigid body registered for the given entity index.
   *
   * Returns `false` if no body was registered or the physics world is not initialised.
   */
  physics3d_remove_body(entity_index: number): boolean;
  /**
   * Remove a specific collider from a 3D body.
   *
   * Returns `false` if the collider was not found or the world is not
   * initialised.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `collider_id`  — Stable ID that was passed when the collider was created.
   */
  physics3d_remove_collider(entity_index: number, collider_id: number): boolean;
  /**
   * Set the angular velocity of a 3D body.
   *
   * Returns `false` if the entity has no registered body.
   */
  physics3d_set_angular_velocity(entity_index: number, ax: number, ay: number, az: number): boolean;
  /**
   * Change the body kind of an existing 3D body at runtime.
   *
   * Returns `false` if the entity has no registered body.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `kind`         — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
   */
  physics3d_set_body_kind(entity_index: number, kind: number): boolean;
  /**
   * Overwrite all state fields of an existing 3D body in one call.
   *
   * Returns `false` if the entity has no registered body.
   *
   * # Arguments
   * * `entity_index`    — ECS entity slot index.
   * * `px/py/pz`        — New world-space position.
   * * `qx/qy/qz/qw`    — New orientation (unit quaternion).
   * * `vx/vy/vz`        — New linear velocity.
   * * `ax/ay/az`        — New angular velocity.
   */
  physics3d_set_body_state(
    entity_index: number,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
    vx: number,
    vy: number,
    vz: number,
    ax: number,
    ay: number,
    az: number,
  ): boolean;
  /**
   * Enable or disable collision event coalescing for the 3D world.
   *
   * When enabled, duplicate `(entity_a, entity_b)` pairs generated within a
   * single step are deduplicated before writing to the ring buffer. This
   * reduces event volume at the cost of losing intermediate state transitions.
   *
   * No-op if the world is not initialised.
   *
   * # Arguments
   * * `enabled` — `true` to enable coalescing, `false` to disable.
   */
  physics3d_set_event_coalescing(enabled: boolean): void;
  /**
   * Set the next kinematic position and orientation of a 3D body.
   *
   * Only affects bodies of kind `2` (KinematicPositionBased). Rapier
   * interpolates from the current to the next position when computing
   * collision response.
   *
   * Returns `false` if the entity has no registered body or the world is not
   * initialised.
   *
   * # Arguments
   * * `entity_index`    — ECS entity slot index.
   * * `px/py/pz`        — Target world-space position.
   * * `qx/qy/qz/qw`    — Target orientation as a unit quaternion (xyzw order).
   */
  physics3d_set_kinematic_position(
    entity_index: number,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
  ): boolean;
  /**
   * Set the linear velocity of a 3D body.
   *
   * Returns `false` if the entity has no registered body.
   */
  physics3d_set_linear_velocity(entity_index: number, vx: number, vy: number, vz: number): boolean;
  /**
   * Select the physics quality preset for the 3D simulation.
   *
   * | Preset | `u8` | Solver iters | Stabilization iters | CCD substeps |
   * |--------|:----:|:------------:|:-------------------:|:------------:|
   * | Low    | 0    | 2            | 1                   | 1            |
   * | Medium | 1    | 4            | 2                   | 1            |
   * | High   | 2    | 8            | 3                   | 2            |
   * | Esport | 3    | 10           | 4                   | 4            |
   *
   * Any unrecognised value maps to `Medium`. No-op if the world is not
   * initialised.
   *
   * # Arguments
   * * `preset` — Quality level discriminant (0–3).
   */
  physics3d_set_quality(preset: number): void;
  physics3d_step(delta: number): void;
  /**
   * Manually override the sensor state for a 3D collider.
   *
   * Normally sensor state is derived automatically from collision events
   * during [`physics3d_step`]. Use this to reset or pre-populate state from
   * the JavaScript side.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `sensor_id`    — Stable collider ID.
   * * `is_active`    — Whether the sensor is currently overlapping.
   * * `count`        — Number of concurrent overlapping contacts.
   */
  physics3d_update_sensor_state(
    entity_index: number,
    sensor_id: number,
    is_active: boolean,
    count: number,
  ): void;
  /**
   * Query entities that have ALL the listed component types.
   * Returns a flat `Uint32Array` of entity indices.
   */
  query_entities(component_type_ids: Uint32Array): Uint32Array;
  /**
   * Query entities and copy their indices into a static buffer.
   * Returns the number of entities found (capped at 10,000).
   *
   * This is an optimized alternative to `query_entities` that avoids
   * allocating a new `Vec` or `Uint32Array` for the result. Use
   * `get_query_result_ptr` to get the pointer to the buffer.
   *
   * # Example
   * ```rust
   * # use gwen_core::bindings::Engine;
   * # let mut engine = Engine::new(100);
   * let count = engine.query_entities_to_buffer(&[0, 1]);
   * let ptr = engine.get_query_result_ptr();
   * // Read count * 4 bytes from ptr in JS.
   * ```
   */
  query_entities_to_buffer(component_type_ids: Uint32Array): number;
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
   * Copies Transform data back from the shared buffer into the ECS
   * `ComponentStorage` after plugin WASM modules (physics, AI…) have
   * updated it.
   *
   * `ptr`         — pointer returned by `alloc_shared_buffer`
   * `max_entities`— number of entity slots to iterate
   *
   * Only slots with the physics-active flag (bit 0) are written back.
   * Stride is 32 bytes per slot (see `alloc_shared_buffer` layout).
   */
  sync_transforms_from_buffer(ptr: number, max_entities: number): void;
  /**
   * Copies Transform data from the ECS `ComponentStorage` into the shared
   * buffer so plugin WASM modules (physics, AI…) can read up-to-date positions.
   *
   * `ptr`         — pointer returned by `alloc_shared_buffer`
   * `max_entities`— number of entity slots to iterate (must be ≤ original allocation)
   *
   * Only entities that have a `Transform` component are written.
   * Stride is 32 bytes per slot (see `alloc_shared_buffer` layout).
   */
  sync_transforms_to_buffer(ptr: number, max_entities: number): void;
  /**
   * Optimized version of `sync_transforms_to_buffer` that only copies
   * entities that have been modified since the last sync.
   *
   * Returns the number of entities synchronized.
   */
  sync_transforms_to_buffer_sparse(ptr: number): number;
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
  update_entity_archetype(_index: number, _component_type_ids: Uint32Array): void;
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
  readonly engine_add_component: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly engine_remove_component: (a: number, b: number, c: number, d: number) => number;
  readonly engine_has_component: (a: number, b: number, c: number, d: number) => number;
  readonly engine_get_component_raw: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => void;
  readonly engine_update_entity_archetype: (a: number, b: number, c: number, d: number) => void;
  readonly engine_remove_entity_from_query: (a: number, b: number) => void;
  readonly engine_get_entity_generation: (a: number, b: number) => number;
  readonly engine_query_entities: (a: number, b: number, c: number, d: number) => void;
  readonly engine_query_entities_to_buffer: (a: number, b: number, c: number) => number;
  readonly engine_get_query_result_ptr: (a: number) => number;
  readonly engine_tick: (a: number, b: number) => void;
  readonly engine_frame_count: (a: number) => bigint;
  readonly engine_delta_time: (a: number) => number;
  readonly engine_total_time: (a: number) => number;
  readonly engine_should_sleep: (a: number) => number;
  readonly engine_sleep_time_ms: (a: number) => number;
  readonly engine_reset_frame: (a: number) => void;
  readonly engine_alloc_shared_buffer: (a: number, b: number) => number;
  readonly engine_sync_transforms_to_buffer: (a: number, b: number, c: number) => void;
  readonly engine_sync_transforms_from_buffer: (a: number, b: number, c: number) => void;
  readonly engine_sync_transforms_to_buffer_sparse: (a: number, b: number) => number;
  readonly engine_dirty_transform_count: (a: number) => number;
  readonly engine_physics3d_init: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly engine_physics3d_step: (a: number, b: number) => void;
  readonly engine_physics3d_add_body: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => number;
  readonly engine_physics3d_remove_body: (a: number, b: number) => number;
  readonly engine_physics3d_has_body: (a: number, b: number) => number;
  readonly engine_physics3d_get_body_state: (a: number, b: number, c: number) => void;
  readonly engine_physics3d_set_body_state: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
  ) => number;
  readonly engine_physics3d_get_linear_velocity: (a: number, b: number, c: number) => void;
  readonly engine_physics3d_set_linear_velocity: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => number;
  readonly engine_physics3d_get_angular_velocity: (a: number, b: number, c: number) => void;
  readonly engine_physics3d_set_angular_velocity: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => number;
  readonly engine_physics3d_apply_impulse: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => number;
  readonly engine_physics3d_get_body_kind: (a: number, b: number) => number;
  readonly engine_physics3d_set_body_kind: (a: number, b: number, c: number) => number;
  readonly engine_physics3d_add_box_collider: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
  ) => number;
  readonly engine_physics3d_add_sphere_collider: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
  ) => number;
  readonly engine_physics3d_add_capsule_collider: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
  ) => number;
  readonly engine_physics3d_remove_collider: (a: number, b: number, c: number) => number;
  readonly engine_physics3d_set_kinematic_position: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => number;
  readonly engine_physics3d_apply_angular_impulse: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => number;
  readonly engine_physics3d_get_sensor_state: (a: number, b: number, c: number) => bigint;
  readonly engine_physics3d_update_sensor_state: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => void;
  readonly engine_physics3d_set_quality: (a: number, b: number) => void;
  readonly engine_physics3d_set_event_coalescing: (a: number, b: number) => void;
  readonly engine_physics3d_get_collision_events_ptr: (a: number) => number;
  readonly engine_physics3d_get_collision_event_count: (a: number) => number;
  readonly engine_physics3d_consume_events: (a: number) => void;
  readonly engine_stats: (a: number, b: number) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
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
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>,
): Promise<InitOutput>;
