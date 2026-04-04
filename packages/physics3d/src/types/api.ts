import type {
  Physics3DVec3,
  Physics3DQuat,
  Physics3DBodyHandle,
  Physics3DBodyKind,
  Physics3DBodyState,
  Physics3DBodySnapshot,
  Physics3DBodyOptions,
  Physics3DEntityId,
  Physics3DColliderOptions,
  Physics3DCollisionContact,
  Physics3DSensorState,
} from './index';
import type { BulkStaticBoxesOptions, BulkStaticBoxesResult } from './bulk';
import type { CompoundColliderOptions3D, CompoundColliderHandle3D } from './colliders';

// ─── Service API ───────────────────────────────────────────────────────────────

/**
 * Service exposed via `engine.inject('physics3d')` after plugin initialization.
 *
 * @example
 * ```ts
 * const physics3d = engine.inject('physics3d');
 * physics3d.createBody(entityId, { kind: 'dynamic' });
 * physics3d.addCollider(entityId, { shape: { type: 'box', halfX: 0.5, halfY: 0.5, halfZ: 0.5 } });
 * ```
 */
export interface Physics3DAPI {
  /**
   * Returns `true` when the plugin has successfully initialized.
   *
   * @returns `true` after `setup()` completes; `false` before init or after `teardown()`.
   *
   * @example
   * ```ts
   * if (!physics3d.isReady()) throw new Error('Physics not ready');
   * ```
   *
   * @since 1.0.0
   */
  isReady(): boolean;

  /**
   * Returns the active WASM core variant this plugin is running against.
   *
   * - `'physics3d'` — Full Rapier3D WASM backend.
   * - `'light'` / `'physics2d'` — TypeScript fallback simulation.
   *
   * @returns The active variant string.
   *
   * @since 1.0.0
   */
  variant(): 'light' | 'physics2d' | 'physics3d';

  /**
   * Manually advance the physics simulation by `deltaSeconds`.
   *
   * In **WASM mode** this delegates to Rapier3D's solver.
   * In **fallback mode** this runs the TypeScript integration step
   * (gravity, damping, position, quaternion rotation).
   *
   * @param deltaSeconds - Time to simulate in seconds. Must be positive.
   * @throws Error when called before plugin initialization.
   *
   * @since 1.0.0
   */
  step(deltaSeconds: number): void;

  /**
   * Create or replace a rigid body for an entity.
   *
   * Any colliders declared in `options.colliders` are attached immediately
   * after body creation. In **fallback mode** the body participates in
   * AABB collision detection each frame.
   *
   * @param entityId - Target entity identifier.
   * @param options  - Body creation options.
   * @returns The opaque body handle for the newly created body.
   *
   * @since 1.0.0
   */
  createBody(entityId: Physics3DEntityId, options?: Physics3DBodyOptions): Physics3DBodyHandle;

  /**
   * Remove the rigid body (and all attached colliders) for an entity.
   *
   * @param entityId - Target entity identifier.
   * @returns `true` when a body was found and removed; `false` when none existed.
   *
   * @since 1.0.0
   */
  removeBody(entityId: Physics3DEntityId): boolean;

  /**
   * Returns `true` if a body is currently registered for the entity.
   *
   * @param entityId - Target entity identifier.
   * @returns `true` when a body handle exists for the entity.
   *
   * @since 1.0.0
   */
  hasBody(entityId: Physics3DEntityId): boolean;

  /**
   * Read the current body kind for an entity.
   *
   * @param entityId - Target entity identifier.
   * @returns The body kind, or `undefined` if no body is registered.
   *
   * @since 1.0.0
   */
  getBodyKind(entityId: Physics3DEntityId): Physics3DBodyKind | undefined;

  /**
   * Update the body kind at runtime.
   *
   * Switching from `'fixed'` to `'dynamic'` re-enables gravity and integration.
   *
   * @param entityId - Target entity identifier.
   * @param kind     - New body kind.
   * @returns `true` when the update succeeded; `false` when no body exists.
   *
   * @since 1.0.0
   */
  setBodyKind(entityId: Physics3DEntityId, kind: Physics3DBodyKind): boolean;

  /**
   * Read a full snapshot of a body's simulation state.
   *
   * In **WASM mode** reads from Rapier3D's internal state.
   * In **fallback mode** returns a deep clone of the TypeScript state object.
   *
   * @param entityId - Target entity identifier.
   * @returns The body state snapshot, or `undefined` when no body is registered.
   *
   * @example
   * ```ts
   * const state = physics3d.getBodyState(entityId);
   * if (state) transform.position.copy(state.position);
   * ```
   *
   * @since 1.0.0
   */
  getBodyState(entityId: Physics3DEntityId): Physics3DBodyState | undefined;

  /** Partially update a body's simulation state. */
  setBodyState(
    entityId: Physics3DEntityId,
    patch: Partial<{
      position: Partial<Physics3DVec3>;
      rotation: Partial<Physics3DQuat>;
      linearVelocity: Partial<Physics3DVec3>;
      angularVelocity: Partial<Physics3DVec3>;
    }>,
  ): boolean;

  /**
   * Apply a linear impulse to a body in N·s. Velocity change = `impulse / mass`.
   *
   * In **fallback mode** directly modifies linear velocity: `v += impulse / mass`.
   *
   * @param entityId - Target entity identifier.
   * @param impulse  - Impulse vector in N·s. Missing components default to `0`.
   * @returns `true` when applied; `false` when no body is registered.
   *
   * @example
   * ```ts
   * physics3d.applyImpulse(entityId, { x: 0, y: 500, z: 0 }); // jump
   * ```
   *
   * @since 1.0.0
   */
  applyImpulse(entityId: Physics3DEntityId, impulse: Partial<Physics3DVec3>): boolean;

  /**
   * Apply an angular impulse to a body in N·m·s.
   *
   * In **fallback mode** directly modifies angular velocity: `ω += impulse / mass`.
   *
   * @param entityId - Target entity identifier.
   * @param impulse  - Angular impulse in N·m·s. Missing components default to `0`.
   * @returns `true` when applied; `false` when no body is registered.
   *
   * @since 1.0.0
   */
  applyAngularImpulse(entityId: Physics3DEntityId, impulse: Partial<Physics3DVec3>): boolean;

  /**
   * Apply a continuous torque to a body in N·m.
   *
   * In **fallback mode** directly increments angular velocity by `torque / mass`.
   * Has no effect on `'fixed'` bodies.
   *
   * In **WASM mode** this method is not forwarded to the Rapier3D bridge and
   * returns `false` — use `applyAngularImpulse` as an alternative.
   *
   * @param entityId - Target entity identifier.
   * @param torque   - Torque vector in N·m. Missing components default to `0`.
   * @returns `true` when applied; `false` when no body exists, body is fixed, or WASM mode.
   *
   * @example
   * ```ts
   * physics3d.applyTorque(entityId, { y: 10 }); // spin around Y axis
   * ```
   *
   * @since 1.0.0
   */
  applyTorque(entityId: Physics3DEntityId, torque: Partial<Physics3DVec3>): boolean;

  /**
   * Read the current linear velocity of a body in m/s.
   *
   * @param entityId - Target entity identifier.
   * @returns The linear velocity vector, or `undefined` when no body exists.
   *
   * @since 1.0.0
   */
  getLinearVelocity(entityId: Physics3DEntityId): Physics3DVec3 | undefined;

  /**
   * Set the linear velocity of a body in m/s. Missing components preserve the current value.
   *
   * @param entityId - Target entity identifier.
   * @param velocity - New linear velocity. Missing components are unchanged.
   * @returns `true` when applied; `false` when no body is registered.
   *
   * @since 1.0.0
   */
  setLinearVelocity(entityId: Physics3DEntityId, velocity: Partial<Physics3DVec3>): boolean;

  /**
   * Read the current angular velocity of a body in rad/s.
   *
   * @param entityId - Target entity identifier.
   * @returns The angular velocity vector, or `undefined` when no body exists.
   *
   * @since 1.0.0
   */
  getAngularVelocity(entityId: Physics3DEntityId): Physics3DVec3 | undefined;

  /**
   * Override the angular velocity of a body directly in rad/s.
   * Missing components preserve the current value.
   *
   * @param entityId - Target entity identifier.
   * @param velocity - New angular velocity. Missing components are unchanged.
   * @returns `true` when applied; `false` when no body is registered.
   *
   * @example
   * ```ts
   * physics3d.setAngularVelocity(entityId, { y: Math.PI * 2 });
   * ```
   *
   * @since 1.0.0
   */
  setAngularVelocity(entityId: Physics3DEntityId, velocity: Partial<Physics3DVec3>): boolean;

  /**
   * Teleport a kinematic body to an exact world-space position and optional rotation.
   *
   * @param entityId - Target entity.
   * @param position - Target world-space position.
   * @param rotation - Optional target rotation. Identity quaternion is used when omitted.
   */
  setKinematicPosition(
    entityId: Physics3DEntityId,
    position: Physics3DVec3,
    rotation?: Physics3DQuat,
  ): boolean;

  /**
   * Integrate N kinematic body positions in one WASM call.
   *
   * Each body `i` is moved by `(vx[i], vy[i], vz[i]) * dt`.
   * Orientation is preserved. All arrays must be the same length.
   *
   * @param slots - Entity slot indices.
   * @param vx - X velocity components in m/s.
   * @param vy - Y velocity components in m/s.
   * @param vz - Z velocity components in m/s.
   * @param dt - Delta time in seconds.
   * @returns Number of bodies updated.
   */
  bulkStepKinematics(
    slots: Uint32Array,
    vx: Float32Array,
    vy: Float32Array,
    vz: Float32Array,
    dt: number,
  ): number;

  /**
   * Integrate N kinematic body orientations in one WASM call.
   *
   * Applies first-order quaternion integration using the supplied angular
   * velocities `(wx[i], wy[i], wz[i])`. Position is preserved.
   *
   * @param slots - Entity slot indices.
   * @param wx - Angular velocity X in rad/s.
   * @param wy - Angular velocity Y in rad/s.
   * @param wz - Angular velocity Z in rad/s.
   * @param dt - Delta time in seconds.
   * @returns Number of bodies updated.
   */
  bulkStepKinematicRotations(
    slots: Uint32Array,
    wx: Float32Array,
    wy: Float32Array,
    wz: Float32Array,
    dt: number,
  ): number;

  /**
   * Attach a collider to an existing body.
   *
   * In **fallback mode** the collider is stored in the local collider registry
   * and participates in AABB collision detection each frame.
   * In **WASM mode** the collider is forwarded to the Rapier3D physics world.
   *
   * @param entityId - Target entity identifier.
   * @param options  - Collider shape, material, sensor flag, and layer configuration.
   * @returns `true` when added; `false` when no body is registered for the entity.
   *
   * @since 1.0.0
   */
  addCollider(entityId: Physics3DEntityId, options: Physics3DColliderOptions): boolean;

  /**
   * Remove a collider by its stable `colliderId`.
   *
   * @returns `false` if no matching collider was found.
   */
  removeCollider(entityId: Physics3DEntityId, colliderId: number): boolean;

  /**
   * Rebuild an existing mesh collider with new geometry.
   *
   * Removes the old trimesh collider identified by `colliderId` and inserts a
   * fresh one built from `vertices` and `indices`. The entity stays in the
   * simulation — only the collider shape changes.
   *
   * @param entityId   - Target entity.
   * @param colliderId - Stable collider ID originally returned by {@link useMeshCollider}.
   * @param vertices   - New flat vertex buffer `[x0,y0,z0, ...]`.
   * @param indices    - New flat index buffer `[a0,b0,c0, ...]`.
   * @param options    - Optional material overrides (friction, restitution, etc.).
   * @returns `true` on success; `false` if the entity has no body.
   */
  rebuildMeshCollider(
    entityId: Physics3DEntityId,
    colliderId: number,
    vertices: Float32Array,
    indices: Uint32Array,
    options?: Pick<
      Physics3DColliderOptions,
      'isSensor' | 'friction' | 'restitution' | 'layers' | 'mask'
    >,
  ): boolean;

  /**
   * Retrieve the pending async BVH load state for a collider that was created
   * with a `__bvhUrl` option. Returns `null` for synchronously-created colliders.
   *
   * @param colliderId - The stable numeric collider id assigned at creation time.
   * @returns Pending load state object, or `null` when the collider is synchronous.
   *
   * @internal Used by {@link useMeshCollider} — not part of the public API.
   */
  _getBvhLoadState(colliderId: number): { ready: Promise<void>; abort(): void } | null;

  /**
   * Spawn N static box rigid bodies in a single operation.
   *
   * In **WASM mode** this makes a single Rust call via `physics3d_bulk_spawn_static_boxes`,
   * amortising the per-body overhead for large static geometry (e.g. level platforms).
   * In **fallback mode** this loops and calls `createBody` N times.
   *
   * Entity IDs are allocated internally via `engine.createEntity()`.
   *
   * @param options - Position buffer, half-extents, and optional material/layer overrides.
   * @returns Packed entity IDs and count of created bodies.
   *
   * @example
   * ```ts
   * const { entityIds } = physics3d.bulkSpawnStaticBoxes({
   *   positions: new Float32Array([0,0,0, 5,0,0, 10,0,0]),
   *   halfExtents: new Float32Array([0.5, 0.5, 0.5]),
   * });
   * ```
   *
   * @since 1.1.0
   */
  bulkSpawnStaticBoxes(options: BulkStaticBoxesOptions): BulkStaticBoxesResult;

  /**
   * Attach multiple primitive colliders to one body in a single batch call.
   *
   * Uses `physics3d_add_compound_collider` in WASM mode (one round-trip) and
   * falls back to individual `addCollider` calls in local-simulation mode.
   *
   * @param entityId - The entity that owns the rigid body.
   * @param options  - Shapes, shared layer membership, and collision filter.
   * @returns A {@link CompoundColliderHandle3D} on success, or `null` when the
   *          entity has no registered body.
   *
   * @since 1.0.0
   */
  addCompoundCollider(
    entityId: Physics3DEntityId,
    options: CompoundColliderOptions3D,
  ): CompoundColliderHandle3D | null;

  /**
   * Read the sensor contact state for `(entityId, sensorId)`.
   *
   * Returns `{ contactCount: 0, isActive: false }` when the sensor was never
   * registered or has not received any events yet.
   */
  getSensorState(entityId: Physics3DEntityId, sensorId: number): Physics3DSensorState;

  /**
   * Manually update the sensor contact state.
   *
   * Intended for test helpers and advanced gameplay logic.
   */
  updateSensorState(
    entityId: Physics3DEntityId,
    sensorId: number,
    isActive: boolean,
    count: number,
  ): void;

  /**
   * Return all collision contacts resolved for the current frame.
   *
   * Pass `{ max }` to cap the number of returned contacts — useful when only
   * the first N contacts matter and you want to avoid allocating a larger array.
   * When `max` is omitted, all contacts for the frame are returned.
   *
   * The returned array is read-only and ephemeral — do not retain across frames.
   *
   * @param opts.max - Maximum number of contacts to return. @default undefined (all)
   */
  getCollisionContacts(opts?: { max?: number }): ReadonlyArray<Physics3DCollisionContact>;

  /**
   * Return lightweight metrics for the last processed frame.
   *
   * `eventCount` is the number of raw collision events read from the WASM ring
   * buffer this frame (0 in local-simulation mode). Useful for debugging
   * high-collision scenes or detecting buffer saturation.
   */
  getCollisionEventMetrics(): { eventCount: number };

  /**
   * Return a compact read-only snapshot for one entity body.
   *
   * All fields are `null` when the body is not registered.
   */
  getBodySnapshot(entityId: Physics3DEntityId): Physics3DBodySnapshot | undefined;

  /**
   * Return the total number of currently registered body handles.
   *
   * @returns Count of registered bodies across all entity slots.
   *
   * @since 1.0.0
   */
  getBodyCount(): number;

  /**
   * Returns `true` when debug logging is enabled for this plugin instance.
   *
   * @returns The resolved `debug` config value.
   *
   * @since 1.0.0
   */
  isDebugEnabled(): boolean;
}
