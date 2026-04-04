/**
 * Types for the GWEN 3D physics plugin.
 * All types are pure data — no WASM dependency.
 */

import type { EntityId } from '@gwenjs/core';

// ─── Primitive types ───────────────────────────────────────────────────────────

/** Three-dimensional vector (x, y, z). */
export interface Physics3DVec3 {
  x: number;
  y: number;
  z: number;
}

/** Unit quaternion representing a 3D rotation. */
export interface Physics3DQuat {
  x: number;
  y: number;
  z: number;
  /** Scalar component. @default 1 */
  w: number;
}

// ─── Config ────────────────────────────────────────────────────────────────────

/**
 * Physics quality preset controlling solver iterations and simulation accuracy.
 *
 * - `'low'`    — Minimum iterations. Best for low-end targets.
 * - `'medium'` — Balanced default.
 * - `'high'`   — More iterations, higher fidelity.
 * - `'esport'` — Maximum iterations for competitive accuracy.
 */
export type Physics3DQualityPreset = 'low' | 'medium' | 'high' | 'esport';

/**
 * Numeric bridge mapping for quality presets (TS -> WASM).
 * Matches the WASM-side enum: 0=low, 1=medium, 2=high, 3=esport.
 */
export const QUALITY_PRESETS: Record<Physics3DQualityPreset, number> = {
  low: 0,
  medium: 1,
  high: 2,
  esport: 3,
} as const;

/**
 * Configuration accepted by the Physics3D plugin constructor.
 */
export interface Physics3DConfig {
  /**
   * Gravity vector in m/s². Partial overrides are accepted.
   * @default { x: 0, y: -9.81, z: 0 }
   */
  gravity?: Partial<Physics3DVec3>;
  /**
   * Maximum number of entity slots. Should match the engine's `maxEntities`.
   * @default 10_000
   */
  maxEntities?: number;
  /**
   * Physics quality preset controlling solver fidelity.
   * @default 'medium'
   */
  qualityPreset?: Physics3DQualityPreset;
  /**
   * Enable Physics3D debug logging to the browser console.
   * @default false
   */
  debug?: boolean;
  /**
   * Enable same-frame collision event coalescing on the WASM side.
   * @default true
   */
  coalesceEvents?: boolean;
  /**
   * Named collision layer definitions. Each entry maps a layer name to a bit
   * position (0-based). Maximum 32 layers.
   *
   * @example
   * ```ts
   * layers: ['default', 'player', 'enemy', 'ground']
   * ```
   */
  layers?: string[];
}

/** Fully resolved Physics3D config (all fields guaranteed). */
export interface ResolvedPhysics3DConfig {
  gravity: Physics3DVec3;
  maxEntities: number;
  qualityPreset: Physics3DQualityPreset;
  debug: boolean;
  coalesceEvents: boolean;
  layers: string[];
}

// ─── Entity ID ─────────────────────────────────────────────────────────────────

/** Accepted forms of entity identity at the Physics3D API boundary. */
export type Physics3DEntityId = string | number | bigint;

// ─── Body ──────────────────────────────────────────────────────────────────────

/**
 * How a 3D rigid body participates in the simulation.
 *
 * - `'fixed'`     — Immovable (walls, terrain).
 * - `'dynamic'`   — Fully simulated (gravity, forces, collisions).
 * - `'kinematic'` — Position driven by explicit writes; ignores gravity.
 */
export type Physics3DBodyKind = 'dynamic' | 'kinematic' | 'fixed';

/**
 * Options accepted by `createBody`.
 */
export interface Physics3DBodyOptions {
  /**
   * How the body participates in the simulation.
   * @default 'dynamic'
   */
  kind?: Physics3DBodyKind;
  /**
   * Body mass in kg. Values ≤ 0 are clamped to 0.0001.
   * @default 1
   */
  mass?: number;
  /**
   * Gravity scale multiplier. 0 = no gravity, 1 = normal.
   * @default 1
   */
  gravityScale?: number;
  /**
   * Linear velocity damping coefficient ≥ 0.
   * @default 0
   */
  linearDamping?: number;
  /**
   * Angular velocity damping coefficient ≥ 0.
   * @default 0
   */
  angularDamping?: number;
  /**
   * Enable Continuous Collision Detection (CCD) for fast-moving bodies.
   * @default false
   */
  ccdEnabled?: boolean;
  /** Initial world-space position in metres. */
  initialPosition?: Partial<Physics3DVec3>;
  /** Initial orientation as a unit quaternion. */
  initialRotation?: Partial<Physics3DQuat>;
  /** Initial linear velocity in m/s. */
  initialLinearVelocity?: Partial<Physics3DVec3>;
  /** Initial angular velocity in rad/s. */
  initialAngularVelocity?: Partial<Physics3DVec3>;
  /**
   * Colliders to attach immediately after body creation.
   */
  colliders?: Physics3DColliderOptions[];
}

/** Opaque handle returned by `createBody`, stored internally. */
export interface Physics3DBodyHandle {
  /** Monotonically increasing body id (per plugin instance). */
  bodyId: number;
  /** The EntityId this handle was created for. */
  entityId: Physics3DEntityId;
  /** Current simulation kind. */
  kind: Physics3DBodyKind;
  /** Body mass in kg. */
  mass: number;
  /** Linear damping coefficient. */
  linearDamping: number;
  /** Angular damping coefficient. */
  angularDamping: number;
}

/**
 * Full snapshot of a body's simulation state.
 *
 * All sub-objects are fresh copies — safe to cache across frames.
 */
export interface Physics3DBodyState {
  /** World-space position in metres. */
  position: Physics3DVec3;
  /** Orientation as a unit quaternion. */
  rotation: Physics3DQuat;
  /** Linear velocity in m/s. */
  linearVelocity: Physics3DVec3;
  /** Angular velocity in rad/s. */
  angularVelocity: Physics3DVec3;
}

/**
 * Enriched read-only snapshot returned by `getBodySnapshot`.
 *
 * Nullable fields allow callers to handle the body-not-found case gracefully.
 */
export interface Physics3DBodySnapshot {
  /** Packed EntityId of the entity. */
  entityId: Physics3DEntityId;
  /** World-space position, or `null` if the body is not registered. */
  position: Physics3DVec3 | null;
  /** Orientation, or `null` if the body is not registered. */
  rotation: Physics3DQuat | null;
  /** Linear velocity in m/s, or `null` if the body is not registered. */
  linearVelocity: Physics3DVec3 | null;
  /** Angular velocity in rad/s, or `null` if the body is not registered. */
  angularVelocity: Physics3DVec3 | null;
}

// ─── Colliders ─────────────────────────────────────────────────────────────────

/**
 * Discriminated union of supported 3D collider shapes.
 */
export type Physics3DColliderShape =
  | { type: 'box'; halfX: number; halfY: number; halfZ: number }
  | { type: 'sphere'; radius: number }
  | { type: 'capsule'; radius: number; halfHeight: number }
  | { type: 'mesh'; vertices: Float32Array; indices: Uint32Array }
  | { type: 'convex'; vertices: Float32Array }
  | {
      type: 'heightfield';
      /** Row-major flat array of rows × cols height values. */
      heights: Float32Array;
      /** Number of rows (Z axis). */
      rows: number;
      /** Number of columns (X axis). */
      cols: number;
      /** World-space width of the entire heightfield in metres. @default 1 */
      scaleX?: number;
      /** World-space maximum height multiplier in metres. @default 1 */
      scaleY?: number;
      /** World-space depth of the entire heightfield in metres. @default 1 */
      scaleZ?: number;
    };

/**
 * Built-in material presets for common surface types.
 *
 * - `'default'` — Standard values.
 * - `'ice'`     — Very low friction.
 * - `'rubber'`  — High friction and moderate restitution.
 * - `'metal'`   — Low friction, high density.
 */
export type Physics3DMaterialPreset = 'default' | 'ice' | 'rubber' | 'metal';

/** Numeric material values for a Physics3DMaterialPreset. */
export interface Physics3DMaterialValues {
  friction: number;
  restitution: number;
  density: number;
}

/** Lookup table for built-in material presets. */
export const PHYSICS3D_MATERIAL_PRESETS: Record<Physics3DMaterialPreset, Physics3DMaterialValues> =
  {
    default: { friction: 0.5, restitution: 0.0, density: 1.0 },
    ice: { friction: 0.02, restitution: 0.0, density: 0.9 },
    rubber: { friction: 1.2, restitution: 0.6, density: 1.2 },
    metal: { friction: 0.3, restitution: 0.05, density: 7.8 },
  } as const;

/**
 * Options for a single collider attached to a body.
 */
export interface Physics3DColliderOptions {
  /** Collider shape definition. */
  shape: Physics3DColliderShape;
  /** Local X offset from the body centre in metres. @default 0 */
  offsetX?: number;
  /** Local Y offset from the body centre in metres. @default 0 */
  offsetY?: number;
  /** Local Z offset from the body centre in metres. @default 0 */
  offsetZ?: number;
  /**
   * When true, generates collision events but produces no physical response.
   * @default false
   */
  isSensor?: boolean;
  /**
   * Friction coefficient ≥ 0.
   * @default 0.5
   */
  friction?: number;
  /**
   * Bounciness in [0, 1].
   * @default 0.0
   */
  restitution?: number;
  /**
   * Collider density in kg/m³. Used when body mass is 0.
   * @default 1.0
   */
  density?: number;
  /**
   * Named collision layers this collider belongs to.
   * Resolved to a bitmask via the layer registry.
   * `undefined` defaults to all-layers (0xFFFFFFFF).
   */
  layers?: string[];
  /**
   * Named layers this collider collides with.
   * `undefined` defaults to all-layers (0xFFFFFFFF).
   */
  mask?: string[];
  /**
   * Stable numeric collider id propagated to collision events and sensor state.
   * Defaults to the collider's array index when omitted.
   */
  colliderId?: number;
  /**
   * Apply a built-in material preset. Preset values are used only for properties
   * not explicitly set on this options object.
   */
  materialPreset?: Physics3DMaterialPreset;
}

// ─── Sensor ─────────────────────────────────────────────────────────────────────

/**
 * Persistent sensor contact state for a `(entityId, sensorId)` pair.
 * Updated each frame from collision events; readable in O(1).
 */
export interface Physics3DSensorState {
  /** Number of overlapping contacts right now. */
  contactCount: number;
  /** `true` when at least one contact is active. */
  isActive: boolean;
}

// ─── Collision events ──────────────────────────────────────────────────────────

/**
 * A resolved collision contact emitted by the Physics3D plugin.
 *
 * `entityA` and `entityB` are packed `EntityId`s ready to pass to the ECS.
 */
export interface Physics3DCollisionContact {
  /** Packed EntityId of the first participant. */
  entityA: EntityId;
  /** Packed EntityId of the second participant. */
  entityB: EntityId;
  /** Collider id on A side (when multi-collider path is used). */
  aColliderId?: number;
  /** Collider id on B side (when multi-collider path is used). */
  bColliderId?: number;
  /** `true` = contact started this frame, `false` = contact ended. */
  started: boolean;
}

// ─── Prefab extension ──────────────────────────────────────────────────────────

/**
 * Extension schema for `definePrefab({ extensions: { physics3d: … } })`.
 *
 * When a prefab is instantiated, the Physics3D plugin reads this object and
 * automatically creates the rigid body and attaches all declared colliders.
 */
export interface Physics3DPrefabExtension {
  /** Body options for the prefab instance. */
  body?: Physics3DBodyOptions;
  /**
   * Optional per-entity collision callback.
   * Called during `onUpdate` for every contact event involving this entity.
   */
  onCollision?: (entityA: EntityId, entityB: EntityId, contact: Physics3DCollisionContact) => void;
}

// ─── Plugin hooks ──────────────────────────────────────────────────────────────

/**
 * Hooks emitted by the Physics3D plugin.
 *
 * Register via `api.hooks.hook('physics3d:collision', ...)`.
 */
export interface Physics3DPluginHooks {
  /**
   * Fired once per frame during `onUpdate` with all resolved collision contacts.
   * The array is read-only and ephemeral — do not retain across frames.
   */
  'physics3d:collision': (contacts: ReadonlyArray<Physics3DCollisionContact>) => void;

  /**
   * Emitted on every sensor state transition (inactive → active or active → inactive).
   * Not emitted on "stay" frames.
   *
   * @param entityId - Packed EntityId of the entity whose sensor changed.
   * @param sensorId - Stable sensor id (e.g. `SENSOR_ID_FOOT`).
   * @param state    - Updated sensor state after the transition.
   */
  'physics3d:sensor:changed': (
    entityId: EntityId,
    sensorId: number,
    state: Physics3DSensorState,
  ) => void;
}

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

// ─── RFC-06 DX Composable types ─────────────────────────────────────────────

/**
 * Zero-copy 3D contact event delivered via SAB ring buffer.
 *
 * entityA/entityB are raw slot indices packed as bigint.
 * contactX/Y/Z is the world-space contact point.
 * normalX/Y/Z is the contact normal (unit vector pointing from B to A).
 * relativeVelocity is the magnitude of the relative impact velocity in m/s.
 * restitution is the effective restitution coefficient at the contact.
 */
export interface ContactEvent3D {
  /** Packed slot index of the first participant. */
  entityA: bigint;
  /** Packed slot index of the second participant. */
  entityB: bigint;
  /** World-space contact point X in metres. */
  contactX: number;
  /** World-space contact point Y in metres. */
  contactY: number;
  /** World-space contact point Z in metres. */
  contactZ: number;
  /** Contact normal X (unit vector from B to A). */
  normalX: number;
  /** Contact normal Y. */
  normalY: number;
  /** Contact normal Z. */
  normalZ: number;
  /** Magnitude of relative impact velocity in m/s. */
  relativeVelocity: number;
  /** Effective restitution coefficient at the contact point. */
  restitution: number;
}

/**
 * Simplified options for registering a static (non-moving) 3D physics body
 * via {@link useStaticBody}.
 */
export interface StaticBodyOptions3D {
  /** Mark as sensor — generates events but no physical response. @default false */
  isSensor?: boolean;
  /** Numeric collision layer bitmask (membership). */
  layer?: number;
  /** Numeric collision filter bitmask (which layers to collide with). */
  mask?: number;
  /** Built-in material preset. @default 'default' */
  materialPreset?: Physics3DMaterialPreset;
}

/**
 * Simplified options for registering a dynamic (fully simulated) 3D physics body
 * via {@link useDynamicBody}.
 */
export interface DynamicBodyOptions3D {
  /** Body mass in kg. Values ≤ 0 are clamped to 0.0001. @default 1 */
  mass?: number;
  /** Gravity scale multiplier. 0 = no gravity. @default 1 */
  gravityScale?: number;
  /** Linear velocity damping coefficient ≥ 0. @default 0 */
  linearDamping?: number;
  /** Angular velocity damping coefficient ≥ 0. @default 0 */
  angularDamping?: number;
  /** Enable Continuous Collision Detection (CCD) for fast-moving bodies. @default false */
  ccdEnabled?: boolean;
  /** Mark as sensor — generates events but no physical response. @default false */
  isSensor?: boolean;
  /** Numeric collision layer bitmask (membership). */
  layer?: number;
  /** Numeric collision filter bitmask (which layers to collide with). */
  mask?: number;
  /** Built-in material preset. @default 'default' */
  materialPreset?: Physics3DMaterialPreset;
  /** Initial world-space position in metres. */
  initialPosition?: Partial<Physics3DVec3>;
  /** Initial orientation as a unit quaternion. */
  initialRotation?: Partial<Physics3DQuat>;
  /** Initial linear velocity in m/s. */
  initialLinearVelocity?: Partial<Physics3DVec3>;
  /** Initial angular velocity in rad/s. */
  initialAngularVelocity?: Partial<Physics3DVec3>;
  /**
   * If true, body cannot rotate around any axis.
   * @default false
   */
  fixedRotation?: boolean;
  /**
   * CCD quality preset for fast-moving bodies.
   * @default 'medium'
   * @see {@link Physics3DQualityPreset}
   */
  quality?: Physics3DQualityPreset;
}

/**
 * Runtime handle for a static physics body registered via {@link useStaticBody}.
 */
export interface StaticBodyHandle3D {
  /** Opaque numeric body id assigned by the physics engine. */
  readonly bodyId: number;
  /** Whether the body is currently active in the simulation. */
  readonly active: boolean;
  /** Re-create the body in the simulation (no-op when already active). */
  enable(): void;
  /** Remove the body from the simulation (no-op when already inactive). */
  disable(): void;
}

/**
 * Runtime handle for a dynamic physics body registered via {@link useDynamicBody}.
 *
 * Extends {@link StaticBodyHandle3D} with force, impulse, torque, and velocity methods.
 */
export interface DynamicBodyHandle3D extends StaticBodyHandle3D {
  /**
   * Apply a continuous linear force to the body in N.
   * Internally mapped to {@link Physics3DAPI.applyImpulse} since
   * the Rapier3D WASM bridge processes forces as per-step impulses.
   */
  applyForce(fx: number, fy: number, fz: number): void;
  /** Apply an instantaneous linear impulse in N·s. */
  applyImpulse(ix: number, iy: number, iz: number): void;
  /** Apply a continuous torque in N·m. */
  applyTorque(tx: number, ty: number, tz: number): void;
  /** Set the linear velocity directly in m/s. */
  setVelocity(vx: number, vy: number, vz: number): void;
  /** Current linear velocity in m/s. Returns zero vector when body is inactive. */
  readonly velocity: Physics3DVec3;
  /** Current angular velocity in rad/s. Returns zero vector when body is inactive. */
  readonly angularVelocity: Physics3DVec3;
}

/**
 * Runtime handle for a physics collider attached via useBoxCollider,
 * useSphereCollider, useCapsuleCollider, useMeshCollider, or useConvexCollider.
 */
export interface ColliderHandle3D {
  /** Stable numeric collider id used to remove the collider later. */
  readonly colliderId: number;
  /** Remove this collider from the entity. */
  remove(): void;
}

/** Handle returned by {@link useBoxCollider}. */
export type BoxColliderHandle3D = ColliderHandle3D;
/** Handle returned by {@link useSphereCollider}. */
export type SphereColliderHandle3D = ColliderHandle3D;
/** Handle returned by {@link useCapsuleCollider}. */
export type CapsuleColliderHandle3D = ColliderHandle3D;
/** Handle returned by {@link useMeshCollider}. */
export type MeshColliderHandle3D = ColliderHandle3D;
/** Handle returned by {@link useConvexCollider}. */
export type ConvexColliderHandle3D = ColliderHandle3D;

// ─── Compound collider ────────────────────────────────────────────────────────

/**
 * Specification for a single primitive shape within a compound collider.
 *
 * All offsets are in local body space (metres). `isSensor`, `friction`, and
 * `restitution` default to `false`, `0.5`, and `0.0` respectively when omitted.
 */
export type CompoundShapeSpec =
  | {
      type: 'box';
      /** Half-extent along the local X axis (metres). */
      halfX: number;
      /** Half-extent along the local Y axis (metres). */
      halfY: number;
      /** Half-extent along the local Z axis (metres). */
      halfZ: number;
      offsetX?: number;
      offsetY?: number;
      offsetZ?: number;
      isSensor?: boolean;
      friction?: number;
      restitution?: number;
    }
  | {
      type: 'sphere';
      radius: number;
      offsetX?: number;
      offsetY?: number;
      offsetZ?: number;
      isSensor?: boolean;
      friction?: number;
      restitution?: number;
    }
  | {
      type: 'capsule';
      radius: number;
      halfHeight: number;
      offsetX?: number;
      offsetY?: number;
      offsetZ?: number;
      isSensor?: boolean;
      friction?: number;
      restitution?: number;
    };

/**
 * Options for {@link useCompoundCollider}.
 *
 * At least one shape must be provided. `layers` and `mask` are shared across
 * all shapes in the compound body.
 */
export interface CompoundColliderOptions3D {
  /** Ordered list of primitive shapes to attach to the body. */
  shapes: CompoundShapeSpec[];
  /** Collision layer membership (named layers, resolved to bitmask). */
  layers?: string[];
  /** Collision filter — which layers this body collides with. */
  mask?: string[];
}

/**
 * Handle returned by {@link useCompoundCollider}.
 *
 * Holds stable IDs for every shape collider, in the same order as
 * `options.shapes`. Call `remove()` to detach all shapes at once.
 */
export interface CompoundColliderHandle3D {
  /** Stable numeric IDs for each shape collider, in `options.shapes` order. */
  readonly colliderIds: readonly number[];
  /** Remove all shapes of this compound collider from the entity. */
  remove(): void;
}

/** Handle returned by {@link useHeightfieldCollider}. */
export interface HeightfieldColliderHandle3D extends ColliderHandle3D {
  /**
   * Replace the height data of the collider.
   *
   * Rebuilds the underlying Rapier3D heightfield in-place using the same
   * grid dimensions and scale that were used at construction time.
   *
   * @param newHeights - Row-major flat array of `rows × cols` height values.
   *   Must have exactly the same length as the original heights array.
   */
  update(newHeights: Float32Array): void;
}
