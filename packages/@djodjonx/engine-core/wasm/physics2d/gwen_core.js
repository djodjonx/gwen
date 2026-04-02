/* @ts-self-types="./gwen_core.d.ts" */

/**
 * Main engine exported to JavaScript
 */
export class Engine {
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    EngineFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_engine_free(ptr, 0);
  }
  /**
   * Add a raw-byte component to an entity.
   *
   * Uses **variable-size** mode: the column accepts any byte slice length
   * and performs an upsert (add-or-update). This is required because
   * TypeScript serialises components as JSON, so the byte length can
   * change between calls for the same component type.
   * @param {number} index
   * @param {number} generation
   * @param {number} component_type_id
   * @param {Uint8Array} data
   * @returns {boolean}
   */
  add_component(index, generation, component_type_id, data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.engine_add_component(
      this.__wbg_ptr,
      index,
      generation,
      component_type_id,
      ptr0,
      len0,
    );
    return ret !== 0;
  }
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
   * @param {number} byte_length
   * @returns {number}
   */
  alloc_shared_buffer(byte_length) {
    const ret = wasm.engine_alloc_shared_buffer(this.__wbg_ptr, byte_length);
    return ret >>> 0;
  }
  /**
   * Get count of live entities
   * @returns {number}
   */
  count_entities() {
    const ret = wasm.engine_count_entities(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Create a new entity. Returns a `JsEntityId` with both `index` and
   * `generation` – keep the whole object, not just the index.
   * @returns {JsEntityId}
   */
  create_entity() {
    const ret = wasm.engine_create_entity(this.__wbg_ptr);
    return JsEntityId.__wrap(ret);
  }
  /**
   * Delete an entity. Requires the full `{index, generation}` pair so
   * that stale handles are correctly rejected.
   * @param {number} index
   * @param {number} generation
   * @returns {boolean}
   */
  delete_entity(index, generation) {
    const ret = wasm.engine_delete_entity(this.__wbg_ptr, index, generation);
    return ret !== 0;
  }
  /**
   * Get delta time for current frame (in seconds)
   * @returns {number}
   */
  delta_time() {
    const ret = wasm.engine_delta_time(this.__wbg_ptr);
    return ret;
  }
  /**
   * Get the number of transforms marked as dirty.
   * @returns {number}
   */
  dirty_transform_count() {
    const ret = wasm.engine_dirty_transform_count(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Get current frame number
   * @returns {bigint}
   */
  frame_count() {
    const ret = wasm.engine_frame_count(this.__wbg_ptr);
    return BigInt.asUintN(64, ret);
  }
  /**
   * Get raw component bytes for an entity (returns empty Vec if not found).
   * On the TypeScript side, use a DataView over the returned Uint8Array.
   * @param {number} index
   * @param {number} generation
   * @param {number} component_type_id
   * @returns {Uint8Array}
   */
  get_component_raw(index, generation, component_type_id) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_get_component_raw(retptr, this.__wbg_ptr, index, generation, component_type_id);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v1 = getArrayU8FromWasm0(r0, r1).slice();
      wasm.__wbindgen_export2(r0, r1 * 1, 1);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Get the current generation for a slot index.
   * Returns u32::MAX if the index is out of bounds.
   * Used by the TS bridge to reconstruct packed EntityIds from query results.
   * @param {number} index
   * @returns {number}
   */
  get_entity_generation(index) {
    const ret = wasm.engine_get_entity_generation(this.__wbg_ptr, index);
    return ret >>> 0;
  }
  /**
   * Get a raw pointer to the static query result buffer.
   *
   * Use this to read the results of the last `query_entities_to_buffer` call
   * from JavaScript without allocations.
   * @returns {number}
   */
  get_query_result_ptr() {
    const ret = wasm.engine_get_query_result_ptr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Check if entity has component
   * @param {number} index
   * @param {number} generation
   * @param {number} component_type_id
   * @returns {boolean}
   */
  has_component(index, generation, component_type_id) {
    const ret = wasm.engine_has_component(this.__wbg_ptr, index, generation, component_type_id);
    return ret !== 0;
  }
  /**
   * Check if entity is alive. Requires `{index, generation}` – returns
   * `false` for any stale handle whose generation no longer matches.
   * @param {number} index
   * @param {number} generation
   * @returns {boolean}
   */
  is_alive(index, generation) {
    const ret = wasm.engine_is_alive(this.__wbg_ptr, index, generation);
    return ret !== 0;
  }
  /**
   * Create a new engine instance
   * @param {number} max_entities
   */
  constructor(max_entities) {
    const ret = wasm.engine_new(max_entities);
    this.__wbg_ptr = ret >>> 0;
    EngineFinalization.register(this, this.__wbg_ptr, this);
    return this;
  }
  /**
   * @param {number} from_x
   * @param {number} from_y
   * @param {number} to_x
   * @param {number} to_y
   * @returns {number}
   */
  path_find_2d(from_x, from_y, to_x, to_y) {
    const ret = wasm.engine_path_find_2d(this.__wbg_ptr, from_x, from_y, to_x, to_y);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  path_get_result_ptr() {
    const ret = wasm.engine_path_get_result_ptr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} handle
   * @param {number} radius
   * @param {number} restitution
   * @param {number} friction
   * @param {number} is_sensor
   * @param {number} density
   * @param {number} membership
   * @param {number} filter
   * @param {number | null} [collider_id]
   * @param {number | null} [offset_x]
   * @param {number | null} [offset_y]
   */
  physics_add_ball_collider(
    handle,
    radius,
    restitution,
    friction,
    is_sensor,
    density,
    membership,
    filter,
    collider_id,
    offset_x,
    offset_y,
  ) {
    wasm.engine_physics_add_ball_collider(
      this.__wbg_ptr,
      handle,
      radius,
      restitution,
      friction,
      is_sensor,
      density,
      membership,
      filter,
      isLikeNone(collider_id) ? 0x100000001 : collider_id >>> 0,
      isLikeNone(offset_x) ? 0x100000001 : Math.fround(offset_x),
      isLikeNone(offset_y) ? 0x100000001 : Math.fround(offset_y),
    );
  }
  /**
   * @param {number} handle
   * @param {number} hw
   * @param {number} hh
   * @param {number} restitution
   * @param {number} friction
   * @param {number} is_sensor
   * @param {number} density
   * @param {number} membership
   * @param {number} filter
   * @param {number | null} [collider_id]
   * @param {number | null} [offset_x]
   * @param {number | null} [offset_y]
   */
  physics_add_box_collider(
    handle,
    hw,
    hh,
    restitution,
    friction,
    is_sensor,
    density,
    membership,
    filter,
    collider_id,
    offset_x,
    offset_y,
  ) {
    wasm.engine_physics_add_box_collider(
      this.__wbg_ptr,
      handle,
      hw,
      hh,
      restitution,
      friction,
      is_sensor,
      density,
      membership,
      filter,
      isLikeNone(collider_id) ? 0x100000001 : collider_id >>> 0,
      isLikeNone(offset_x) ? 0x100000001 : Math.fround(offset_x),
      isLikeNone(offset_y) ? 0x100000001 : Math.fround(offset_y),
    );
  }
  /**
   * @param {number} slot
   * @param {number} x
   * @param {number} y
   * @param {number} body_type
   * @param {number} mass
   * @param {number} gravity_scale
   * @param {number} linear_damping
   * @param {number} angular_damping
   * @param {number} vx
   * @param {number} vy
   * @param {number | null} [ccd_enabled]
   * @param {number | null} [extra_solver_iters]
   * @returns {number}
   */
  physics_add_rigid_body(
    slot,
    x,
    y,
    body_type,
    mass,
    gravity_scale,
    linear_damping,
    angular_damping,
    vx,
    vy,
    ccd_enabled,
    extra_solver_iters,
  ) {
    const ret = wasm.engine_physics_add_rigid_body(
      this.__wbg_ptr,
      slot,
      x,
      y,
      body_type,
      mass,
      gravity_scale,
      linear_damping,
      angular_damping,
      vx,
      vy,
      isLikeNone(ccd_enabled) ? 0x100000001 : ccd_enabled >>> 0,
      isLikeNone(extra_solver_iters) ? 0x100000001 : extra_solver_iters >>> 0,
    );
    return ret >>> 0;
  }
  /**
   * @returns {Uint32Array}
   */
  physics_consume_event_metrics() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_physics_consume_event_metrics(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v1 = getArrayU32FromWasm0(r0, r1).slice();
      wasm.__wbindgen_export2(r0, r1 * 4, 4);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @returns {number}
   */
  physics_get_collision_event_count() {
    const ret = wasm.engine_physics_get_collision_event_count(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @returns {number}
   */
  physics_get_collision_events_ptr() {
    const ret = wasm.engine_physics_get_collision_events_ptr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} slot
   * @returns {Float32Array}
   */
  physics_get_linear_velocity(slot) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_physics_get_linear_velocity(retptr, this.__wbg_ptr, slot);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v1 = getArrayF32FromWasm0(r0, r1).slice();
      wasm.__wbindgen_export2(r0, r1 * 4, 4);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {number} slot
   * @returns {Float32Array}
   */
  physics_get_position(slot) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_physics_get_position(retptr, this.__wbg_ptr, slot);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v1 = getArrayF32FromWasm0(r0, r1).slice();
      wasm.__wbindgen_export2(r0, r1 * 4, 4);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {number} slot
   * @param {number} collider_id
   * @returns {Uint32Array}
   */
  physics_get_sensor_state(slot, collider_id) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_physics_get_sensor_state(retptr, this.__wbg_ptr, slot, collider_id);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v1 = getArrayU32FromWasm0(r0, r1).slice();
      wasm.__wbindgen_export2(r0, r1 * 4, 4);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * @param {number} grav_x
   * @param {number} grav_y
   * @param {number} _max_entities
   */
  physics_init(grav_x, grav_y, _max_entities) {
    wasm.engine_physics_init(this.__wbg_ptr, grav_x, grav_y, _max_entities);
  }
  /**
   * @param {number} slot
   */
  physics_remove_rigid_body(slot) {
    wasm.engine_physics_remove_rigid_body(this.__wbg_ptr, slot);
  }
  /**
   * @param {number} _enabled
   */
  physics_set_event_coalescing(_enabled) {
    wasm.engine_physics_set_event_coalescing(this.__wbg_ptr, _enabled);
  }
  /**
   * @param {number} _enabled
   */
  physics_set_global_ccd_enabled(_enabled) {
    wasm.engine_physics_set_global_ccd_enabled(this.__wbg_ptr, _enabled);
  }
  /**
   * @param {number} preset
   */
  physics_set_quality(preset) {
    wasm.engine_physics_set_quality(this.__wbg_ptr, preset);
  }
  /**
   * @param {number} delta
   */
  physics_step(delta) {
    wasm.engine_physics_step(this.__wbg_ptr, delta);
  }
  /**
   * @param {number} _slot
   * @param {number} _collider_id
   * @param {number} _active
   */
  physics_update_sensor_state(_slot, _collider_id, _active) {
    wasm.engine_physics_update_sensor_state(this.__wbg_ptr, _slot, _collider_id, _active);
  }
  /**
   * Query entities that have ALL the listed component types.
   * Returns a flat `Uint32Array` of entity indices.
   * @param {Uint32Array} component_type_ids
   * @returns {Uint32Array}
   */
  query_entities(component_type_ids) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passArray32ToWasm0(component_type_ids, wasm.__wbindgen_export);
      const len0 = WASM_VECTOR_LEN;
      wasm.engine_query_entities(retptr, this.__wbg_ptr, ptr0, len0);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v2 = getArrayU32FromWasm0(r0, r1).slice();
      wasm.__wbindgen_export2(r0, r1 * 4, 4);
      return v2;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
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
   * @param {Uint32Array} component_type_ids
   * @returns {number}
   */
  query_entities_to_buffer(component_type_ids) {
    const ptr0 = passArray32ToWasm0(component_type_ids, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.engine_query_entities_to_buffer(this.__wbg_ptr, ptr0, len0);
    return ret >>> 0;
  }
  /**
   * Register a new component type and return a unique numeric type ID.
   *
   * Each call returns a fresh, monotonically increasing ID.  Unlike the
   * native Rust API (which uses `std::any::TypeId`), this counter is
   * JS-friendly: callers just keep the returned number and pass it back.
   *
   * The actual column is created lazily on the first `add_component` call,
   * using the byte-slice length to determine the element size.
   * @returns {number}
   */
  register_component_type() {
    const ret = wasm.engine_register_component_type(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Remove a component from an entity.
   * @param {number} index
   * @param {number} generation
   * @param {number} component_type_id
   * @returns {boolean}
   */
  remove_component(index, generation, component_type_id) {
    const ret = wasm.engine_remove_component(this.__wbg_ptr, index, generation, component_type_id);
    return ret !== 0;
  }
  /**
   * Remove an entity from the query system cache.
   * Must be called after delete_entity so the query system stops returning
   * the destroyed entity in subsequent queries.
   * @param {number} index
   */
  remove_entity_from_query(index) {
    wasm.engine_remove_entity_from_query(this.__wbg_ptr, index);
  }
  /**
   * Reset frame timing
   */
  reset_frame() {
    wasm.engine_reset_frame(this.__wbg_ptr);
  }
  /**
   * Check if should sleep for FPS capping
   * @returns {boolean}
   */
  should_sleep() {
    const ret = wasm.engine_should_sleep(this.__wbg_ptr);
    return ret !== 0;
  }
  /**
   * Get sleep time in milliseconds
   * @returns {number}
   */
  sleep_time_ms() {
    const ret = wasm.engine_sleep_time_ms(this.__wbg_ptr);
    return ret;
  }
  /**
   * Get engine statistics as JSON string
   * @returns {string}
   */
  stats() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_stats(retptr, this.__wbg_ptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export2(deferred1_0, deferred1_1, 1);
    }
  }
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
   * @param {number} ptr
   * @param {number} max_entities
   */
  sync_transforms_from_buffer(ptr, max_entities) {
    wasm.engine_sync_transforms_from_buffer(this.__wbg_ptr, ptr, max_entities);
  }
  /**
   * Copies Transform data from the ECS `ComponentStorage` into the shared
   * buffer so plugin WASM modules (physics, AI…) can read up-to-date positions.
   *
   * `ptr`         — pointer returned by `alloc_shared_buffer`
   * `max_entities`— number of entity slots to iterate (must be ≤ original allocation)
   *
   * Only entities that have a `Transform` component are written.
   * Stride is 32 bytes per slot (see `alloc_shared_buffer` layout).
   * @param {number} ptr
   * @param {number} max_entities
   */
  sync_transforms_to_buffer(ptr, max_entities) {
    wasm.engine_sync_transforms_to_buffer(this.__wbg_ptr, ptr, max_entities);
  }
  /**
   * Optimized version of `sync_transforms_to_buffer` that only copies
   * entities that have been modified since the last sync.
   *
   * Returns the number of entities synchronized.
   * @param {number} ptr
   * @returns {number}
   */
  sync_transforms_to_buffer_sparse(ptr) {
    const ret = wasm.engine_sync_transforms_to_buffer_sparse(this.__wbg_ptr, ptr);
    return ret >>> 0;
  }
  /**
   * Update game loop (call every frame with delta in milliseconds)
   * @param {number} delta_ms
   */
  tick(delta_ms) {
    wasm.engine_tick(this.__wbg_ptr, delta_ms);
  }
  /**
   * Get total elapsed time (in seconds)
   * @returns {number}
   */
  total_time() {
    const ret = wasm.engine_total_time(this.__wbg_ptr);
    return ret;
  }
  /**
   * Update the archetype of an entity after component changes.
   * Pass the full list of component type IDs currently on the entity.
   * @param {number} _index
   * @param {Uint32Array} _component_type_ids
   */
  update_entity_archetype(_index, _component_type_ids) {
    const ptr0 = passArray32ToWasm0(_component_type_ids, wasm.__wbindgen_export);
    const len0 = WASM_VECTOR_LEN;
    wasm.engine_update_entity_archetype(this.__wbg_ptr, _index, ptr0, len0);
  }
}
if (Symbol.dispose) Engine.prototype[Symbol.dispose] = Engine.prototype.free;

/**
 * Entity handle returned to JavaScript.
 * Carries both `index` and `generation` so JS can pass them back and
 * the engine can detect stale (dangling) references.
 */
export class JsEntityId {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(JsEntityId.prototype);
    obj.__wbg_ptr = ptr;
    JsEntityIdFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    JsEntityIdFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_jsentityid_free(ptr, 0);
  }
  /**
   * Generation counter – incremented every time the slot is reused.
   * Use this to detect dangling references.
   * @returns {number}
   */
  get generation() {
    const ret = wasm.jsentityid_generation(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Slot index (stable while entity lives and after slot is recycled)
   * @returns {number}
   */
  get index() {
    const ret = wasm.jsentityid_index(this.__wbg_ptr);
    return ret >>> 0;
  }
}
if (Symbol.dispose) JsEntityId.prototype[Symbol.dispose] = JsEntityId.prototype.free;

/**
 * Find a path between two points in 2D space.
 *
 * # Returns
 * The number of nodes in the found path (up to `MAX_PATH_NODES`).
 * @param {number} start_x
 * @param {number} start_y
 * @param {number} end_x
 * @param {number} end_y
 * @returns {number}
 */
export function find_path_2d(start_x, start_y, end_x, end_y) {
  const ret = wasm.find_path_2d(start_x, start_y, end_x, end_y);
  return ret >>> 0;
}

/**
 * Returns the number of collision events currently stored in the buffer.
 * @returns {number}
 */
export function get_collision_event_count() {
  const ret = wasm.get_collision_event_count();
  return ret >>> 0;
}

/**
 * Returns a raw pointer to the static collision event buffer.
 *
 * # Safety
 * This pointer is only valid for the duration of the frame after the physics step.
 * Writing to this buffer from JS is undefined behavior.
 * @returns {number}
 */
export function get_collision_events_ptr() {
  const ret = wasm.get_collision_events_ptr();
  return ret >>> 0;
}

/**
 * Returns a raw pointer to the static path buffer.
 *
 * # Safety
 * This pointer is only valid until the next `find_path_2d` call.
 * @returns {number}
 */
export function get_path_buffer_ptr() {
  const ret = wasm.get_path_buffer_ptr();
  return ret >>> 0;
}

function __wbg_get_imports() {
  const import0 = {
    __proto__: null,
    __wbg___wbindgen_throw_6ddd609b62940d55: function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    },
  };
  return {
    __proto__: null,
    './gwen_core_bg.js': import0,
  };
}

const EngineFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_engine_free(ptr >>> 0, 1));
const JsEntityIdFinalization =
  typeof FinalizationRegistry === 'undefined'
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry((ptr) => wasm.__wbg_jsentityid_free(ptr >>> 0, 1));

function getArrayF32FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU32FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined &&
      cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
  if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
    cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
  if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
    cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
  }
  return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
  return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4, 4) >>> 0;
  getUint32ArrayMemory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
  numBytesDecoded += len;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    numBytesDecoded = len;
  }
  return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
  wasm = instance.exports;
  wasmModule = module;
  cachedDataViewMemory0 = null;
  cachedFloat32ArrayMemory0 = null;
  cachedUint32ArrayMemory0 = null;
  cachedUint8ArrayMemory0 = null;
  return wasm;
}

async function __wbg_load(module, imports) {
  if (typeof Response === 'function' && module instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        return await WebAssembly.instantiateStreaming(module, imports);
      } catch (e) {
        const validResponse = module.ok && expectedResponseType(module.type);

        if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
          console.warn(
            '`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n',
            e,
          );
        } else {
          throw e;
        }
      }
    }

    const bytes = await module.arrayBuffer();
    return await WebAssembly.instantiate(bytes, imports);
  } else {
    const instance = await WebAssembly.instantiate(module, imports);

    if (instance instanceof WebAssembly.Instance) {
      return { instance, module };
    } else {
      return instance;
    }
  }

  function expectedResponseType(type) {
    switch (type) {
      case 'basic':
      case 'cors':
      case 'default':
        return true;
    }
    return false;
  }
}

function initSync(module) {
  if (wasm !== undefined) return wasm;

  if (module !== undefined) {
    if (Object.getPrototypeOf(module) === Object.prototype) {
      ({ module } = module);
    } else {
      console.warn('using deprecated parameters for `initSync()`; pass a single object instead');
    }
  }

  const imports = __wbg_get_imports();
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
  if (wasm !== undefined) return wasm;

  if (module_or_path !== undefined) {
    if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
      ({ module_or_path } = module_or_path);
    } else {
      console.warn(
        'using deprecated parameters for the initialization function; pass a single object instead',
      );
    }
  }

  if (module_or_path === undefined) {
    module_or_path = new URL('gwen_core_bg.wasm', import.meta.url);
  }
  const imports = __wbg_get_imports();

  if (
    typeof module_or_path === 'string' ||
    (typeof Request === 'function' && module_or_path instanceof Request) ||
    (typeof URL === 'function' && module_or_path instanceof URL)
  ) {
    module_or_path = fetch(module_or_path);
  }

  const { instance, module } = await __wbg_load(await module_or_path, imports);

  return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
