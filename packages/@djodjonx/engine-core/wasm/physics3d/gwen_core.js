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
   * @param {number} entity_index
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} kind
   * @param {number} mass
   * @param {number} linear_damping
   * @param {number} angular_damping
   * @returns {boolean}
   */
  physics3d_add_body(entity_index, x, y, z, kind, mass, linear_damping, angular_damping) {
    const ret = wasm.engine_physics3d_add_body(
      this.__wbg_ptr,
      entity_index,
      x,
      y,
      z,
      kind,
      mass,
      linear_damping,
      angular_damping,
    );
    return ret !== 0;
  }
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
   * @param {number} entity_index
   * @param {number} half_x
   * @param {number} half_y
   * @param {number} half_z
   * @param {number} offset_x
   * @param {number} offset_y
   * @param {number} offset_z
   * @param {boolean} is_sensor
   * @param {number} friction
   * @param {number} restitution
   * @param {number} layer_bits
   * @param {number} mask_bits
   * @param {number} collider_id
   * @returns {boolean}
   */
  physics3d_add_box_collider(
    entity_index,
    half_x,
    half_y,
    half_z,
    offset_x,
    offset_y,
    offset_z,
    is_sensor,
    friction,
    restitution,
    layer_bits,
    mask_bits,
    collider_id,
  ) {
    const ret = wasm.engine_physics3d_add_box_collider(
      this.__wbg_ptr,
      entity_index,
      half_x,
      half_y,
      half_z,
      offset_x,
      offset_y,
      offset_z,
      is_sensor,
      friction,
      restitution,
      layer_bits,
      mask_bits,
      collider_id,
    );
    return ret !== 0;
  }
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
   * @param {number} entity_index
   * @param {number} radius
   * @param {number} half_height
   * @param {number} offset_x
   * @param {number} offset_y
   * @param {number} offset_z
   * @param {boolean} is_sensor
   * @param {number} friction
   * @param {number} restitution
   * @param {number} layer_bits
   * @param {number} mask_bits
   * @param {number} collider_id
   * @returns {boolean}
   */
  physics3d_add_capsule_collider(
    entity_index,
    radius,
    half_height,
    offset_x,
    offset_y,
    offset_z,
    is_sensor,
    friction,
    restitution,
    layer_bits,
    mask_bits,
    collider_id,
  ) {
    const ret = wasm.engine_physics3d_add_capsule_collider(
      this.__wbg_ptr,
      entity_index,
      radius,
      half_height,
      offset_x,
      offset_y,
      offset_z,
      is_sensor,
      friction,
      restitution,
      layer_bits,
      mask_bits,
      collider_id,
    );
    return ret !== 0;
  }
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
   * @param {number} entity_index
   * @param {number} radius
   * @param {number} offset_x
   * @param {number} offset_y
   * @param {number} offset_z
   * @param {boolean} is_sensor
   * @param {number} friction
   * @param {number} restitution
   * @param {number} layer_bits
   * @param {number} mask_bits
   * @param {number} collider_id
   * @returns {boolean}
   */
  physics3d_add_sphere_collider(
    entity_index,
    radius,
    offset_x,
    offset_y,
    offset_z,
    is_sensor,
    friction,
    restitution,
    layer_bits,
    mask_bits,
    collider_id,
  ) {
    const ret = wasm.engine_physics3d_add_sphere_collider(
      this.__wbg_ptr,
      entity_index,
      radius,
      offset_x,
      offset_y,
      offset_z,
      is_sensor,
      friction,
      restitution,
      layer_bits,
      mask_bits,
      collider_id,
    );
    return ret !== 0;
  }
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
   * @param {number} entity_index
   * @param {number} ax
   * @param {number} ay
   * @param {number} az
   * @returns {boolean}
   */
  physics3d_apply_angular_impulse(entity_index, ax, ay, az) {
    const ret = wasm.engine_physics3d_apply_angular_impulse(
      this.__wbg_ptr,
      entity_index,
      ax,
      ay,
      az,
    );
    return ret !== 0;
  }
  /**
   * Apply a world-space linear impulse to a 3D body.
   *
   * Wakes the body if sleeping. Returns `false` if the entity has no body.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `ix/iy/iz`     — Impulse vector (N·s).
   * @param {number} entity_index
   * @param {number} ix
   * @param {number} iy
   * @param {number} iz
   * @returns {boolean}
   */
  physics3d_apply_impulse(entity_index, ix, iy, iz) {
    const ret = wasm.engine_physics3d_apply_impulse(this.__wbg_ptr, entity_index, ix, iy, iz);
    return ret !== 0;
  }
  /**
   * Clear all pending 3D collision events.
   *
   * Call after JavaScript has finished reading the event buffer. The next
   * [`physics3d_step`] call also implicitly clears the buffer.
   *
   * No-op if the world is not initialised.
   */
  physics3d_consume_events() {
    wasm.engine_physics3d_consume_events(this.__wbg_ptr);
  }
  /**
   * Return the angular velocity of a 3D body as `[ax, ay, az]` (rad/s).
   *
   * Returns an empty array if the entity has no body.
   * @param {number} entity_index
   * @returns {Float32Array}
   */
  physics3d_get_angular_velocity(entity_index) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_physics3d_get_angular_velocity(retptr, this.__wbg_ptr, entity_index);
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
   * Return the body kind discriminant for a 3D body.
   *
   * Returns `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased,
   * or `255` if the entity has no registered body.
   * @param {number} entity_index
   * @returns {number}
   */
  physics3d_get_body_kind(entity_index) {
    const ret = wasm.engine_physics3d_get_body_kind(this.__wbg_ptr, entity_index);
    return ret;
  }
  /**
   * Return the full body state as a flat `Float32Array` of 13 elements.
   *
   * Layout: `[px, py, pz, qx, qy, qz, qw, vx, vy, vz, ax, ay, az]`
   *
   * Returns an empty array if the entity has no body or the world is not
   * initialised.
   * @param {number} entity_index
   * @returns {Float32Array}
   */
  physics3d_get_body_state(entity_index) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_physics3d_get_body_state(retptr, this.__wbg_ptr, entity_index);
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
   * Return the number of 3D collision events written since the last step.
   *
   * Returns `0` if the world is not initialised.
   * @returns {number}
   */
  physics3d_get_collision_event_count() {
    const ret = wasm.engine_physics3d_get_collision_event_count(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Return a raw pointer to the 3D collision event ring buffer.
   *
   * The buffer lives in WASM linear memory and remains valid for the
   * lifetime of the module. JavaScript should wrap the result in a typed
   * array view of length `physics3d_get_collision_event_count() * EVENT_STRIDE_3D`.
   *
   * Returns `0` if the world is not initialised.
   * @returns {number}
   */
  physics3d_get_collision_events_ptr() {
    const ret = wasm.engine_physics3d_get_collision_events_ptr(this.__wbg_ptr);
    return ret >>> 0;
  }
  /**
   * Return the linear velocity of a 3D body as `[vx, vy, vz]`.
   *
   * Returns an empty array if the entity has no body.
   * @param {number} entity_index
   * @returns {Float32Array}
   */
  physics3d_get_linear_velocity(entity_index) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.engine_physics3d_get_linear_velocity(retptr, this.__wbg_ptr, entity_index);
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
   * Return the sensor state for a 3D collider as a packed `u64`.
   *
   * Bit layout: `bits 0–31 = contact_count (u32)`, `bit 32 = is_active (bool)`.
   * Returns `0` if no state has been recorded or the world is not initialised.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `sensor_id`    — Stable collider ID used when the sensor was created.
   * @param {number} entity_index
   * @param {number} sensor_id
   * @returns {bigint}
   */
  physics3d_get_sensor_state(entity_index, sensor_id) {
    const ret = wasm.engine_physics3d_get_sensor_state(this.__wbg_ptr, entity_index, sensor_id);
    return BigInt.asUintN(64, ret);
  }
  /**
   * Return `true` if a 3D body is registered for the given entity index.
   * @param {number} entity_index
   * @returns {boolean}
   */
  physics3d_has_body(entity_index) {
    const ret = wasm.engine_physics3d_has_body(this.__wbg_ptr, entity_index);
    return ret !== 0;
  }
  /**
   * @param {number} gx
   * @param {number} gy
   * @param {number} gz
   * @param {number} _max_entities
   */
  physics3d_init(gx, gy, gz, _max_entities) {
    wasm.engine_physics3d_init(this.__wbg_ptr, gx, gy, gz, _max_entities);
  }
  /**
   * Remove the 3D rigid body registered for the given entity index.
   *
   * Returns `false` if no body was registered or the physics world is not initialised.
   * @param {number} entity_index
   * @returns {boolean}
   */
  physics3d_remove_body(entity_index) {
    const ret = wasm.engine_physics3d_remove_body(this.__wbg_ptr, entity_index);
    return ret !== 0;
  }
  /**
   * Remove a specific collider from a 3D body.
   *
   * Returns `false` if the collider was not found or the world is not
   * initialised.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `collider_id`  — Stable ID that was passed when the collider was created.
   * @param {number} entity_index
   * @param {number} collider_id
   * @returns {boolean}
   */
  physics3d_remove_collider(entity_index, collider_id) {
    const ret = wasm.engine_physics3d_remove_collider(this.__wbg_ptr, entity_index, collider_id);
    return ret !== 0;
  }
  /**
   * Set the angular velocity of a 3D body.
   *
   * Returns `false` if the entity has no registered body.
   * @param {number} entity_index
   * @param {number} ax
   * @param {number} ay
   * @param {number} az
   * @returns {boolean}
   */
  physics3d_set_angular_velocity(entity_index, ax, ay, az) {
    const ret = wasm.engine_physics3d_set_angular_velocity(
      this.__wbg_ptr,
      entity_index,
      ax,
      ay,
      az,
    );
    return ret !== 0;
  }
  /**
   * Change the body kind of an existing 3D body at runtime.
   *
   * Returns `false` if the entity has no registered body.
   *
   * # Arguments
   * * `entity_index` — ECS entity slot index.
   * * `kind`         — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
   * @param {number} entity_index
   * @param {number} kind
   * @returns {boolean}
   */
  physics3d_set_body_kind(entity_index, kind) {
    const ret = wasm.engine_physics3d_set_body_kind(this.__wbg_ptr, entity_index, kind);
    return ret !== 0;
  }
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
   * @param {number} entity_index
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @param {number} qx
   * @param {number} qy
   * @param {number} qz
   * @param {number} qw
   * @param {number} vx
   * @param {number} vy
   * @param {number} vz
   * @param {number} ax
   * @param {number} ay
   * @param {number} az
   * @returns {boolean}
   */
  physics3d_set_body_state(entity_index, px, py, pz, qx, qy, qz, qw, vx, vy, vz, ax, ay, az) {
    const ret = wasm.engine_physics3d_set_body_state(
      this.__wbg_ptr,
      entity_index,
      px,
      py,
      pz,
      qx,
      qy,
      qz,
      qw,
      vx,
      vy,
      vz,
      ax,
      ay,
      az,
    );
    return ret !== 0;
  }
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
   * @param {boolean} enabled
   */
  physics3d_set_event_coalescing(enabled) {
    wasm.engine_physics3d_set_event_coalescing(this.__wbg_ptr, enabled);
  }
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
   * @param {number} entity_index
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @param {number} qx
   * @param {number} qy
   * @param {number} qz
   * @param {number} qw
   * @returns {boolean}
   */
  physics3d_set_kinematic_position(entity_index, px, py, pz, qx, qy, qz, qw) {
    const ret = wasm.engine_physics3d_set_kinematic_position(
      this.__wbg_ptr,
      entity_index,
      px,
      py,
      pz,
      qx,
      qy,
      qz,
      qw,
    );
    return ret !== 0;
  }
  /**
   * Set the linear velocity of a 3D body.
   *
   * Returns `false` if the entity has no registered body.
   * @param {number} entity_index
   * @param {number} vx
   * @param {number} vy
   * @param {number} vz
   * @returns {boolean}
   */
  physics3d_set_linear_velocity(entity_index, vx, vy, vz) {
    const ret = wasm.engine_physics3d_set_linear_velocity(this.__wbg_ptr, entity_index, vx, vy, vz);
    return ret !== 0;
  }
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
   * @param {number} preset
   */
  physics3d_set_quality(preset) {
    wasm.engine_physics3d_set_quality(this.__wbg_ptr, preset);
  }
  /**
   * @param {number} delta
   */
  physics3d_step(delta) {
    wasm.engine_physics3d_step(this.__wbg_ptr, delta);
  }
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
   * @param {number} entity_index
   * @param {number} sensor_id
   * @param {boolean} is_active
   * @param {number} count
   */
  physics3d_update_sensor_state(entity_index, sensor_id, is_active, count) {
    wasm.engine_physics3d_update_sensor_state(
      this.__wbg_ptr,
      entity_index,
      sensor_id,
      is_active,
      count,
    );
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
