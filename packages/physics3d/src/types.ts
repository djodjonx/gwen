/**
 * Types for the GWEN 3D physics plugin.
 * All types are pure data — no WASM dependency.
 */

import type { EntityId } from '@gwenengine/core';
import type { EngineAPI } from '@gwenengine/core';

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
  | { type: 'capsule'; radius: number; halfHeight: number };

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
  onCollision?: (
    entityA: EntityId,
    entityB: EntityId,
    contact: Physics3DCollisionContact,
    api: EngineAPI,
  ) => void;
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
 * Service exposed in `api.services.get('physics3d')` after plugin initialization.
 *
 * @example
 * ```ts
 * const physics3d = api.services.get('physics3d');
 * physics3d.createBody(entityId, { kind: 'dynamic' });
 * physics3d.addCollider(entityId, { shape: { type: 'box', halfX: 0.5, halfY: 0.5, halfZ: 0.5 } });
 * ```
 */
export interface Physics3DAPI {
  /** Returns `true` when the plugin has successfully initialized. */
  isReady(): boolean;

  /** Active WASM core variant. */
  variant(): 'light' | 'physics2d' | 'physics3d';

  /** Manual physics step. Available after `onInit`; throws otherwise. */
  step(deltaSeconds: number): void;

  /**
   * Create or replace a rigid body for an entity.
   *
   * Any colliders declared in `options.colliders` are attached immediately
   * after body creation.
   */
  createBody(entityId: Physics3DEntityId, options?: Physics3DBodyOptions): Physics3DBodyHandle;

  /** Remove the rigid body (and all attached colliders) for an entity. */
  removeBody(entityId: Physics3DEntityId): boolean;

  /** Returns `true` if a body is currently registered for the entity. */
  hasBody(entityId: Physics3DEntityId): boolean;

  /** Read the current body kind for an entity. */
  getBodyKind(entityId: Physics3DEntityId): Physics3DBodyKind | undefined;

  /** Update the body kind at runtime. */
  setBodyKind(entityId: Physics3DEntityId, kind: Physics3DBodyKind): boolean;

  /** Read a full snapshot of a body's simulation state. */
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

  /** Apply a linear impulse to a body in N·s. */
  applyImpulse(entityId: Physics3DEntityId, impulse: Partial<Physics3DVec3>): boolean;

  /** Apply an angular impulse to a body in N·m·s. */
  applyAngularImpulse(entityId: Physics3DEntityId, impulse: Partial<Physics3DVec3>): boolean;

  /** Read the current linear velocity of a body. */
  getLinearVelocity(entityId: Physics3DEntityId): Physics3DVec3 | undefined;

  /** Set the linear velocity of a body. */
  setLinearVelocity(entityId: Physics3DEntityId, velocity: Partial<Physics3DVec3>): boolean;

  /** Read the current angular velocity of a body. */
  getAngularVelocity(entityId: Physics3DEntityId): Physics3DVec3 | undefined;

  /** Set the angular velocity of a body. */
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
   * In local mode the collider is stored in the metadata registry.
   * In WASM mode the collider is forwarded to the physics world.
   */
  addCollider(entityId: Physics3DEntityId, options: Physics3DColliderOptions): boolean;

  /**
   * Remove a collider by its stable `colliderId`.
   *
   * @returns `false` if no matching collider was found.
   */
  removeCollider(entityId: Physics3DEntityId, colliderId: number): boolean;

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

  /** Return the total number of currently registered body handles. */
  getBodyCount(): number;

  /** Returns `true` when debug logging is enabled. */
  isDebugEnabled(): boolean;
}
