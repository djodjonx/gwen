/**
 * Types for the GWEN 2D physics plugin.
 * All types are pure data — no WASM dependency.
 */

import type { EntityId } from '@gwenjs/core';

// ─── Config ───────────────────────────────────────────────────────────────────

export type PhysicsQualityPreset = 'low' | 'medium' | 'high' | 'esport';
export type PhysicsEventMode = 'pull' | 'hybrid';

/** Numeric bridge mapping for solver quality presets (TS -> WASM). */
export const PHYSICS_QUALITY_PRESET_CODE: Record<PhysicsQualityPreset, number> = {
  low: 0,
  medium: 1,
  high: 2,
  esport: 3,
} as const;

export interface Physics2DConfig {
  /**
   * Gravity on the Y axis in m/s². Negative = downward.
   * @default -9.81
   */
  gravity?: number;
  /**
   * Gravity on the X axis in m/s².
   * @default 0
   */
  gravityX?: number;
  /**
   * Maximum number of entity slots. Must match the engine's `maxEntities`.
   * @default 10_000
   */
  maxEntities?: number;
  /**
   * Physics quality preset.
   * @default 'medium'
   */
  qualityPreset?: PhysicsQualityPreset;
  /**
   * Collision event delivery mode.
   * - `pull`: first-class path via `getCollisionEventsBatch()`
   * - `hybrid`: pull + convenience hook dispatch in `onUpdate`
   * @default 'pull'
   */
  eventMode?: PhysicsEventMode;
  /**
   * Enable Physics2D debug logs in the browser console.
   * When `false` (default), the plugin stays silent.
   * @default false
   */
  debug?: boolean;

  /**
   * Enable collision event coalescing on the Rust side.
   * Keeps the event stream quieter by deduplicating same-frame duplicates per pair.
   * @default true
   */
  coalesceEvents?: boolean;

  /**
   * Global CCD fallback for bodies without local override.
   * If omitted, the plugin derives a default from `qualityPreset`.
   */
  ccdEnabled?: boolean;

  /**
   * Named collision layer definitions.
   * Each key maps to a bit index (0-based). Maximum 32 layers.
   *
   * @example
   * ```ts
   * layers: { default: 0, player: 1, enemy: 2, ground: 3, trigger: 4 }
   * ```
   */
  layers?: Record<string, number>;
}

// ─── Body & Collider ──────────────────────────────────────────────────────────

/**
 * How a rigid body participates in the simulation.
 * - `'fixed'`     — immovable (walls, floors).
 * - `'dynamic'`   — fully simulated (affected by gravity and forces).
 * - `'kinematic'` — manually driven by velocity; ignores gravity.
 */
export type RigidBodyType = 'fixed' | 'dynamic' | 'kinematic';

/** Numeric encoding of `RigidBodyType` passed through the WASM boundary. */
export const BODY_TYPE: Record<RigidBodyType, number> = {
  fixed: 0,
  dynamic: 1,
  kinematic: 2,
} as const;

export interface ColliderOptions {
  /** Bounciness in [0, 1]. 0 = no bounce, 1 = perfectly elastic. @default 0 */
  restitution?: number;
  /** Friction coefficient ≥ 0. 0 = frictionless. @default 0.5 */
  friction?: number;
  /** If true, generates collision events but no physical response. @default false */
  isSensor?: boolean;
  /** Collider density in kg/m². Used when mass is 0. @default 1.0 */
  density?: number;
  /**
   * Named layer this collider belongs to. Resolved to a bitmask via the
   * layer registry initialized from `Physics2DConfig.layers`.
   * Accepts either a layer name or a raw bitmask `number`.
   * @default 0xFFFFFFFF (all layers)
   */
  membershipLayers?: string[] | number;
  /**
   * Named layers this collider can collide with. Resolved to a bitmask.
   * Accepts either an array of layer names or a raw bitmask `number`.
   * @default 0xFFFFFFFF (all layers)
   */
  filterLayers?: string[] | number;
  /**
   * Stable collider id propagated to collision events.
   * `undefined` means absent (legacy mono-collider fallback).
   */
  colliderId?: number;
  /** Local collider offset X in metres. */
  offsetX?: number;
  /** Local collider offset Y in metres. */
  offsetY?: number;
}

// ─── Collision events ─────────────────────────────────────────────────────────

/**
 * A contact event emitted by the physics simulation each frame.
 * Retrieved via `engine.inject('physics2d').getCollisionEvents()`.
 *
 * **Prefer the `physics:collision` hook** for EntityId-native collision handling:
 *
 * ```typescript
 * engine.hooks.hook('physics:collision', (contacts) => {
 *   for (const { entityA, entityB, started } of contacts) {
 *     if (!started) continue;
 *     const tag = api.getComponent(entityA, Tag);
 *   }
 * });
 * ```
 */
export interface CollisionEvent {
  /** Numeric collider id on A side (stable within a prefab declaration). */
  aColliderId?: number;
  /** Numeric collider id on B side (stable within a prefab declaration). */
  bColliderId?: number;
  /** `true` = contact started this frame, `false` = contact ended. */
  started: boolean;
}

/**
 * Pull-first batch returned by `getCollisionEventsBatch()`.
 *
 * The `events` array is frame-local and may be pooled/reused by the plugin.
 * Read it synchronously and do not retain it across frames.
 */
export interface CollisionEventsBatch {
  /** Monotonic physics frame index produced by the WASM world. */
  frame: number;
  /** Number of readable events in `events`. */
  count: number;
  /** Total dropped events since the previous successful read. */
  droppedSinceLastRead: number;
  /** Dropped critical events since the previous successful read. */
  droppedCritical: number;
  /** Dropped non-critical events since the previous successful read. */
  droppedNonCritical: number;
  /** Whether same-frame contact coalescing was enabled when this batch was produced. */
  coalesced: boolean;
  /**
   * Reused event view for the current frame.
   * Treat as read-only and ephemeral.
   */
  events: ReadonlyArray<CollisionEvent>;
}

// ─── Enriched collision contact ───────────────────────────────────────────────

/**
 * A fully resolved collision contact, emitted via the `physics:collision` hook.
 *
 * Unlike the raw `CollisionEvent`, `entityA` and `entityB` are already-resolved
 * packed `EntityId`s — ready to pass directly to `api.getComponent()` or
 * `api.destroyEntity()`.
 *
 * Emitted once per contact pair per frame (started AND ended).
 *
 * @example
 * ```typescript
 * engine.hooks.hook('physics:collision', (contacts) => {
 *   for (const { entityA, entityB, started } of contacts) {
 *     if (!started) continue;
 *     const tagA = api.getComponent(entityA, Tag);
 *     const tagB = api.getComponent(entityB, Tag);
 *   }
 * });
 * ```
 */
export interface CollisionContact {
  /** Resolved packed EntityId of the first participant. */
  entityA: EntityId;
  /** Resolved packed EntityId of the second participant. */
  entityB: EntityId;
  /** Collider id on A side when available (multi-colliders path). */
  aColliderId?: number;
  /** Collider id on B side when available (multi-colliders path). */
  bColliderId?: number;
  /** `true` = contact started this frame, `false` = contact ended. */
  started: boolean;
}

// ─── Sensor state ─────────────────────────────────────────────────────────────

/**
 * Persistent sensor contact state for a (entity, sensorId) pair.
 * Updated each frame from collision events; readable in O(1) from any system.
 *
 * @example
 * ```ts
 * const foot = physics.getSensorState(entityId, SENSOR_FOOT);
 * if (foot.isActive) allowJump();
 * ```
 */
export interface SensorState {
  /** Number of distinct overlapping contacts right now. */
  contactCount: number;
  /** `true` when at least one contact is active. */
  isActive: boolean;
}

// ─── Hooks provided by this plugin ───────────────────────────────────────────

/**
 * Hooks emitted by the Physics2D plugin.
 *
 * Declared as `providesHooks` on the plugin so that `gwen prepare` can
 * augment `GwenProvides` — giving full type-safety on
 * `engine.hooks.hook('physics:collision', ...)` without any cast.
 */
export interface Physics2DPluginHooks {
  /**
   * Fired once per frame (during `onUpdate`) with all resolved collision contacts.
   * Handlers receive a read-only snapshot.
   */
  'physics:collision': (contacts: ReadonlyArray<CollisionContact>) => void;

  /**
   * Optional convenience hook emitted at most once per frame when `eventMode` is `hybrid`.
   * Prefer the pull API in gameplay hot paths.
   */
  'physics:collision:batch': (batch: Readonly<CollisionEventsBatch>) => void;

  /**
   * Emitted once per sensor state transition (inactive -> active or active -> inactive).
   * Never emitted on stable "stay" frames.
   *
   * @param entityId - Packed EntityId of the entity whose sensor state changed.
   * @param sensorId - Stable sensor identifier (e.g. `SENSOR_ID_FOOT`).
   * @param state    - Updated sensor state after the transition.
   */
  'physics:sensor:changed': (entityId: EntityId, sensorId: number, state: SensorState) => void;
}

// ─── Prefab extensions ────────────────────────────────────────────────────────

/**
 * Extension schema for `definePrefab({ extensions: { physics: … } })`.
 *
 * When a prefab is instantiated, the Physics2D plugin reads this object from
 * the `prefab:instantiate` hook and automatically creates the corresponding
 * Rapier rigid body + collider.
 *
 * Exactly one of `radius` (ball) or `hw`/`hh` (box) must be provided.
 *
 * @example
 * ```ts
 * export const PlayerPrefab = definePrefab({
 *   name: 'Player',
 *   extensions: {
 *     physics: { bodyType: 'kinematic', radius: 14 },
 *   },
 *   create: (api) => { … },
 * });
 * ```
 */
export interface PhysicsMaterialPreset {
  friction?: number;
  restitution?: number;
  density?: number;
}

export type PhysicsMaterialPresetName = 'default' | 'ice' | 'rubber';

export const PHYSICS_MATERIAL_PRESETS: Record<
  PhysicsMaterialPresetName,
  Required<PhysicsMaterialPreset>
> = {
  default: { friction: 0.5, restitution: 0, density: 1.0 },
  ice: { friction: 0.02, restitution: 0, density: 1.0 },
  rubber: { friction: 1.2, restitution: 0.85, density: 1.0 },
};

export type PhysicsColliderShape = 'box' | 'ball';

// ─── RFC-04 composable types ───────────────────────────────────────────────

export type ColliderShape = PhysicsColliderShape; // alias

/** Options for creating a static (non-moving) physics body. */
export interface StaticBodyOptions {
  /** Collider shape type. @default 'box' */
  shape?: ColliderShape;
  /** Collision layer bitmask. @default undefined */
  layer?: number;
  /** Collision mask bitmask. @default undefined */
  mask?: number;
  /** Whether this body is a sensor. @default false */
  isSensor?: boolean;
}

/** Handle for a static body, allowing enable/disable at runtime. */
export interface StaticBodyHandle {
  /** Unique body ID assigned by the physics engine. */
  readonly bodyId: number;
  /** Whether the body is currently active. */
  readonly active: boolean;
  /** Enable the body in the simulation. */
  enable(): void;
  /** Disable the body in the simulation. */
  disable(): void;
}

/** Options for creating a dynamic (simulated) physics body. */
export interface DynamicBodyOptions {
  /** Collider shape type. @default 'box' */
  shape?: ColliderShape;
  /** Collision layer bitmask. @default undefined */
  layer?: number;
  /** Collision mask bitmask. @default undefined */
  mask?: number;
  /** Mass of the body. @default 1 */
  mass?: number;
  /** Linear damping factor. @default 0 */
  linearDamping?: number;
  /** Angular damping factor. @default 0 */
  angularDamping?: number;
  /**
   * Prevent the body from rotating.
   *
   * NOTE: `fixedRotation` is accepted in options but cannot be passed to
   * `Physics2DAPI.addRigidBody` at this time — the underlying API does not
   * expose this parameter.
   *
   * TODO: Track at https://github.com/... once the API exposes the parameter.
   *
   * @default false
   */
  fixedRotation?: boolean;
  /** Gravity scale. @default 1 */
  gravityScale?: number;
}

/** Handle for a dynamic body, allowing force/impulse/velocity control. */
export interface DynamicBodyHandle {
  /** Unique body ID assigned by the physics engine. */
  readonly bodyId: number;
  /** Whether the body is currently active in the simulation. */
  readonly active: boolean;
  /** Apply a force to the body. */
  applyForce(fx: number, fy: number): void;
  /** Apply an impulse to the body. */
  applyImpulse(ix: number, iy: number): void;
  /** Apply a torque to the body (optional). */
  applyTorque?(t: number): void;
  /** Set the linear velocity of the body. */
  setVelocity(vx: number, vy: number): void;
  /** Current velocity of the body. */
  readonly velocity: { x: number; y: number };
  /** Enable the body in the simulation. */
  enable(): void;
  /** Disable the body in the simulation. */
  disable(): void;
}

/** Handle for a box collider. */
export interface BoxColliderHandle {
  /** Unique collider ID assigned by the physics engine. */
  readonly colliderId: number;
  /** Whether this collider is a sensor. */
  readonly isSensor: boolean;
}

/** Handle for a circle collider. */
export interface CircleColliderHandle {
  /** Unique collider ID assigned by the physics engine. */
  readonly colliderId: number;
  /** Whether this collider is a sensor. */
  readonly isSensor: boolean;
}

/** Handle for a capsule collider. */
export interface CapsuleColliderHandle {
  /** Unique collider ID assigned by the physics engine. */
  readonly colliderId: number;
  /** Whether this collider is a sensor. */
  readonly isSensor: boolean;
}

/** Collision contact event delivered to onContact(). */
export interface ContactEvent {
  /** Entity ID of the first body. */
  entityA: bigint;
  /** Entity ID of the second body. */
  entityB: bigint;
  /** Contact X position. */
  contactX: number;
  /** Contact Y position. */
  contactY: number;
  /** Contact normal X. */
  normalX: number;
  /** Contact normal Y. */
  normalY: number;
  /** Relative velocity at contact. */
  relativeVelocity: number;
}

/** Definition of named physics layers for collision filtering. */
export interface Physics2DLayerDefinition {
  [key: string]: number;
}

/**
 * Semantic role for platformer-style grounded derivation.
 * This remains gameplay-facing metadata on the TS side and is not hardcoded in Rust.
 */
export type PhysicsGroundedRole = 'none' | 'head' | 'body' | 'foot';

// ─── Tilemap chunks (Sprint 6) ──────────────────────────────────────────────

/** Versioned binary/JSON contract for baked tilemap physics chunks. */
export const TILEMAP_PHYSICS_CHUNK_FORMAT_VERSION = 1;

/** Compact rectangle in tile units, local to a chunk. */
export interface TilemapChunkRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One baked physics chunk. */
export interface TilemapPhysicsChunk {
  /** Stable key: `${chunkX}:${chunkY}`. */
  key: string;
  chunkX: number;
  chunkY: number;
  checksum: string;
  rects: ReadonlyArray<TilemapChunkRect>;
  colliders: ReadonlyArray<PhysicsColliderDef>;
}

/** Full bake output for a tilemap. */
export interface TilemapPhysicsChunkMap {
  formatVersion: number;
  mapWidthTiles: number;
  mapHeightTiles: number;
  chunkSizeTiles: number;
  tileSizePx: number;
  chunks: ReadonlyArray<TilemapPhysicsChunk>;
}

/** Input for `buildTilemapPhysicsChunks`. */
export interface BuildTilemapPhysicsChunksInput {
  tiles: ReadonlyArray<number>;
  mapWidthTiles: number;
  mapHeightTiles: number;
  chunkSizeTiles?: number;
  tileSizePx?: number;
  isSolidTile?: (tileValue: number, x: number, y: number) => boolean;
}

/** Input for incremental `patchTilemapPhysicsChunk`. */
export interface PatchTilemapPhysicsChunkInput {
  source: BuildTilemapPhysicsChunksInput;
  chunkX: number;
  chunkY: number;
  previous: TilemapPhysicsChunkMap;
}

/** Shared context object passed to high-level helpers. */
export interface Physics2DHelperContext {
  /** Physics service instance resolved from `engine.inject('physics2d')`. */
  physics: Physics2DAPI;
  /** Optional pixel-to-meter ratio used by helpers performing conversions. */
  pixelsPerMeter?: number;
}

/** Read-only physics snapshot for one entity slot. */
export interface PhysicsEntitySnapshot {
  /** Packed EntityId — primary key. */
  entityId: EntityId;
  /** Position in world meters + rotation in radians, when available. */
  position: { x: number; y: number; rotation: number } | null;
  /** Linear velocity in m/s, when available. */
  velocity: { x: number; y: number } | null;
}

/**
 * Collision event resolved to packed EntityIds for ECS consumption.
 * @deprecated Use {@link CollisionContact} instead.
 */
export type ResolvedCollisionContact = CollisionContact;

/** Runtime loader that keeps tilemap physics chunks in sync with a visible set. */
export interface TilemapChunkOrchestrator {
  /**
   * Sync loaded chunks with the provided visible chunk coordinates.
   * Coordinates are chunk-space indices, not pixels.
   */
  syncVisibleChunks(chunks: ReadonlyArray<{ chunkX: number; chunkY: number }>): void;
  /** Re-bake one chunk and patch it in place. */
  patchChunk(chunkX: number, chunkY: number, nextSource: BuildTilemapPhysicsChunksInput): void;
  /** Unload all tracked chunks and release internal references. */
  dispose(): void;
}

export interface PhysicsColliderDef extends PhysicsMaterialPreset {
  /** Optional stable collider id (string key) for gameplay mapping. */
  id?: string;
  /**
   * Stable numeric collider id propagated to collision events and sensor state.
   * When set, takes precedence over the collider's array index.
   * Use `SENSOR_ID_FOOT` for the ground-detection foot sensor.
   */
  colliderId?: number;
  shape: PhysicsColliderShape;
  /** Built-in material preset name or custom material object. */
  material?: PhysicsMaterialPresetName | PhysicsMaterialPreset;
  /** Half-width in pixels for `shape: 'box'`. */
  hw?: number;
  /** Half-height in pixels for `shape: 'box'`. */
  hh?: number;
  /** Radius in pixels for `shape: 'ball'`. */
  radius?: number;
  /** Local collider offset X in pixels (reserved for runtime support). */
  offsetX?: number;
  /** Local collider offset Y in pixels (reserved for runtime support). */
  offsetY?: number;
  isSensor?: boolean;
  /** Optional gameplay semantic role (e.g. foot sensor). */
  groundedRole?: PhysicsGroundedRole;
  /** Named layers this collider belongs to. */
  membershipLayers?: string[] | number;
  /** Named layers this collider can collide with. */
  filterLayers?: string[] | number;
}

export interface Physics2DPrefabExtension {
  /** How the body participates in the simulation. */
  bodyType?: RigidBodyType;

  /** Built-in material preset name or custom material object. */
  material?: PhysicsMaterialPresetName | PhysicsMaterialPreset;

  /** Optional per-body CCD override. */
  ccdEnabled?: boolean;
  /** Optional per-body additional solver iterations (clamped on Rust side). */
  additionalSolverIterations?: number;

  /**
   * Preferred vNext collider schema.
   * This is the only supported collider schema in v2.
   */
  colliders?: PhysicsColliderDef[];

  // ── Rigid body properties ─────────────────────────────────────────────
  /**
   * Mass in kg (dynamic bodies only). 0 = derive from collider density.
   * @default 1.0
   */
  mass?: number;
  /**
   * Gravity scale multiplier. 0 = no gravity, 1 = normal.
   * @default 1.0
   */
  gravityScale?: number;
  /** Linear velocity damping ≥ 0. @default 0 */
  linearDamping?: number;
  /** Angular velocity damping ≥ 0. @default 0 */
  angularDamping?: number;
  /**
   * Initial linear velocity in pixels/s (converted to m/s internally).
   * Dynamic bodies only.
   */
  initialVelocity?: { vx: number; vy: number };

  // ── Collision callback ────────────────────────────────────────────────────
  onCollision?: (self: EntityId, other: EntityId, contact: CollisionContact) => void;
}

/** Bridge schema version shared by TS and Rust wasm-bindgen exports. */
export const PHYSICS2D_BRIDGE_SCHEMA_VERSION = 2;
/** Binary ring format version for the `events` channel. */
export const PHYSICS2D_EVENTS_RING_FORMAT_VERSION = 2;

/**
 * Byte stride for one collision event in the **live WASM ring buffer**
 * read directly by the physics plugin (not the public ring-buffer format).
 *
 * Layout (16 bytes, little-endian):
 * ```
 * [slotA u32][slotB u32][type u32][aColliderId u16][bColliderId u16]
 * ```
 * - `type`: 0 or 2 = contact started; other values = contact ended
 * - collider id `0xFFFF` means absent
 *
 * This differs from the public ring-buffer format parsed by
 * `readCollisionEventsFromBuffer()`, which uses a 19-byte stride with
 * an 8-byte header and `u32` collider IDs.
 */
export const PHYSICS2D_WASM_EVENT_STRIDE = 16;

// ─── Collision event parsing ─────────────────────────────────────────────────

// ─── Binary event reader ──────────────────────────────────────────────────────

const EVENT_HEADER_BYTES = 8;
const EVENT_STRIDE = 19;
const LEGACY_EVENT_STRIDE = 11;
const COLLIDER_ID_ABSENT = 0xffffffff;

/**
 * Read all pending collision events from a **ring-buffer channel** buffer.
 *
 * @remarks
 * This function reads a **different binary format** from the one used by the
 * live WASM event buffer ({@link PHYSICS2D_WASM_EVENT_STRIDE}). It is intended
 * for offline / testing use cases where events are written to a ring-buffer
 * with an 8-byte header.
 *
 * Format:
 * - Header 8 bytes: `[write_head u32 LE][read_head u32 LE]`
 * - Each event **19 bytes** (current) or **11 bytes** (legacy):
 *   - 19-byte: `[type u16][slotA u32][slotB u32][aColliderId u32][bColliderId u32][flags u8]`
 *   - 11-byte: `[type u16][slotA u32][slotB u32][flags u8]`
 *   - `flags` bit 0: 1 = started, 0 = ended
 *   - collider id `0xFFFFFFFF` = absent
 *
 * Advances `read_head` to `write_head` after reading (marks the buffer as consumed).
 * Slot indices are consumed internally and not exposed on the returned events.
 *
 * **Not for live WASM reads** — the active WASM ring buffer uses a 16-byte stride
 * without a header and is read directly by the physics plugin internals.
 */
export function readCollisionEventsFromBuffer(bufOrView: ArrayBuffer | DataView): CollisionEvent[] {
  void PHYSICS2D_EVENTS_RING_FORMAT_VERSION;
  const view = bufOrView instanceof DataView ? bufOrView : new DataView(bufOrView);
  const writeHead = view.getUint32(0, true);
  const readHead = view.getUint32(4, true);
  const payloadBytes = view.byteLength - EVENT_HEADER_BYTES;
  const stride = payloadBytes % EVENT_STRIDE === 0 ? EVENT_STRIDE : LEGACY_EVENT_STRIDE;
  const capacity = Math.floor(payloadBytes / stride);

  if (capacity <= 0 || writeHead === readHead) return [];

  const events: CollisionEvent[] = [];
  let idx = readHead;

  while (idx !== writeHead) {
    const offset = EVENT_HEADER_BYTES + idx * stride;
    if (stride === EVENT_STRIDE) {
      const rawA = view.getUint32(offset + 10, true);
      const rawB = view.getUint32(offset + 14, true);
      const flags = view.getUint8(offset + 18);
      events.push({
        ...(rawA === COLLIDER_ID_ABSENT ? {} : { aColliderId: rawA }),
        ...(rawB === COLLIDER_ID_ABSENT ? {} : { bColliderId: rawB }),
        started: (flags & 1) === 1,
      });
    } else {
      const flags = view.getUint8(offset + 10);
      events.push({ started: (flags & 1) === 1 });
    }
    idx = (idx + 1) % capacity;
  }

  view.setUint32(4, writeHead, true);
  return events;
}

// ─── Physics2D service API ────────────────────────────────────────────────────

/**
 * Service exposed via `engine.inject('physics2d')` after the plugin is initialized.
 *
 * @example
 * ```typescript
 * setup(engine: GwenEngine) {
 *   const physics = engine.inject('physics2d');
 *   const handle = physics.addRigidBody(entityIndex, 'dynamic', 0, 10);
 *   physics.addBoxCollider(handle, 0.5, 0.5);
 * }
 * onUpdate(_dt: number) {
 *   for (const ev of physics.getCollisionEvents()) {
 *     console.log('collision', ev.entityA, ev.entityB);
 *   }
 * }
 * ```
 */
export interface Physics2DAPI {
  /** Returns true when Physics2D plugin debug mode is enabled. */
  isDebugEnabled?(): boolean;

  /**
   * Register a rigid body for an entity.
   * @param entityId  Packed EntityId — the engine's primary entity key.
   * @param type      Body simulation type.
   * @param x         Initial world position X in metres.
   * @param y         Initial world position Y in metres.
   * @param opts      Optional body properties.
   * @returns Opaque `bodyHandle` to pass to `addBoxCollider` / `addBallCollider`.
   */
  addRigidBody(
    entityId: EntityId,
    type: RigidBodyType,
    x: number,
    y: number,
    opts?: {
      mass?: number;
      gravityScale?: number;
      linearDamping?: number;
      angularDamping?: number;
      initialVelocity?: { vx: number; vy: number };
      ccdEnabled?: boolean;
      additionalSolverIterations?: number;
    },
  ): number;

  /**
   * Add an axis-aligned box collider to a body.
   * @param bodyHandle  Return value of `addRigidBody`.
   */
  addBoxCollider(bodyHandle: number, hw: number, hh: number, opts?: ColliderOptions): void;

  /**
   * Add a ball (circle) collider to a body.
   * @param bodyHandle  Return value of `addRigidBody`.
   */
  addBallCollider(bodyHandle: number, radius: number, opts?: ColliderOptions): void;

  /** Remove the rigid body (and all its colliders) for an entity. */
  removeBody(entityId: EntityId): void;

  /** Directly set the position of a kinematic body (metres). */
  setKinematicPosition(entityId: EntityId, x: number, y: number): void;

  /** Apply an instantaneous linear impulse to a body (N·s). */
  applyImpulse(entityId: EntityId, x: number, y: number): void;

  /** Set the linear velocity of a body directly (m/s). */
  setLinearVelocity(entityId: EntityId, vx: number, vy: number): void;

  /** Read current linear velocity (m/s). */
  getLinearVelocity(entityId: EntityId): { x: number; y: number } | null;

  /**
   * Pull-first collision API.
   */
  getCollisionEventsBatch(opts?: { max?: number; coalesced?: boolean }): CollisionEventsBatch;

  /**
   * Pull-first collision API resolved to packed EntityIds.
   *
   * Skips contacts for which entity generation cannot be resolved.
   */
  getCollisionContacts(opts?: { max?: number }): ReadonlyArray<ResolvedCollisionContact>;

  /** Return current world position and rotation of an entity. */
  getPosition(entityId: EntityId): { x: number; y: number; rotation: number } | null;

  /**
   * Read the current sensor contact state for (entityId, sensorId).
   * Returns `{ contactCount: 0, isActive: false }` if the sensor was never registered.
   */
  getSensorState(entityId: EntityId, sensorId: number): SensorState;

  /**
   * Manually update a sensor contact state.
   */
  updateSensorState(entityId: EntityId, sensorId: number, started: boolean): void;

  /**
   * Bake a navigation mesh based on currently loaded static geometry and tilemap chunks.
   * Pathfinding queries will use the state as of the last call to this method.
   */
  buildNavmesh?(): void;

  /**
   * Find a path between two points in world space (metres).
   * Returns an array of waypoints or an empty array if no path is found.
   */
  findPath?(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Array<{ x: number; y: number }>;

  /** Load or replace one baked tilemap physics chunk at world origin `(x, y)` in metres. */
  loadTilemapPhysicsChunk(
    chunk: TilemapPhysicsChunk,
    x: number,
    y: number,
    opts?: { debugNaive?: boolean },
  ): void;

  /** Unload one previously loaded tilemap physics chunk by stable chunk key. */
  unloadTilemapPhysicsChunk(key: string): void;

  /** Replace one loaded chunk with a freshly patched bake. */
  patchTilemapPhysicsChunk(
    chunk: TilemapPhysicsChunk,
    x: number,
    y: number,
    opts?: { debugNaive?: boolean },
  ): void;
}

// ─── WASM module shape (generated by wasm-bindgen) ────────────────────────────

/**
 * Minimal TypeScript interface of the wasm-bindgen generated module.
 * The real types are generated from the Rust bindings — this is a
 * safe-to-import approximation for the glue layer.
 */
export interface Physics2DWasmModule {
  /** Constructor exported by wasm-bindgen. */
  Physics2DPlugin: new (
    gravityX: number,
    gravityY: number,
    transformBuf: Uint8Array,
    eventsBuf: Uint8Array,
    maxEntities: number,
  ) => WasmPhysics2DPlugin;

  /** wasm-bindgen default init function. */
  default?: (init?: unknown) => Promise<void>;
}

export interface WasmPhysics2DPlugin {
  add_rigid_body(
    entityIndex: number,
    x: number,
    y: number,
    bodyType: number,
    mass: number,
    gravityScale: number,
    linearDamping: number,
    angularDamping: number,
    vx: number,
    vy: number,
    ccdEnabled?: number,
    additionalSolverIterations?: number,
  ): number;
  add_box_collider(
    bodyHandle: number,
    hw: number,
    hh: number,
    restitution: number,
    friction: number,
    isSensor: number,
    density: number,
    membership: number,
    filter: number,
    colliderId?: number,
    offsetX?: number,
    offsetY?: number,
  ): void;
  add_ball_collider(
    bodyHandle: number,
    radius: number,
    restitution: number,
    friction: number,
    isSensor: number,
    density: number,
    membership: number,
    filter: number,
    colliderId?: number,
    offsetX?: number,
    offsetY?: number,
  ): void;
  remove_rigid_body(entityIndex: number): void;
  set_kinematic_position(entityIndex: number, x: number, y: number): void;
  apply_impulse(entityIndex: number, x: number, y: number): void;
  set_linear_velocity(entityIndex: number, vx: number, vy: number): void;
  get_linear_velocity(entityIndex: number): number[];
  step(delta: number): void;
  get_position(entityIndex: number): number[];
  stats(): string;
  /** Consume frame-local event pipeline telemetry: [frame, droppedCritical, droppedNonCritical, coalescedFlag]. */
  consume_event_metrics?(): number[];
  /** Enable or disable same-frame event coalescing on the Rust side. */
  set_event_coalescing?(enabled: number): void;
  /** Apply global solver quality preset (0=low, 1=medium, 2=high, 3=esport). */
  set_quality_preset?(preset: number): void;
  /** Apply global CCD fallback (1=enabled, 0=disabled). */
  set_global_ccd_enabled?(enabled: number): void;
  /** Bridge schema version for TS/WASM compatibility checks. */
  bridge_schema_version?(): number;
  /** Read sensor state: [contactCount, isActive(0|1)]. */
  get_sensor_state?(entityIndex: number, sensorId: number): number[];
  /** Update sensor state from TS side. started=1 → increment, 0 → decrement. */
  update_sensor_state?(entityIndex: number, sensorId: number, started: number): void;
  load_tilemap_chunk_body?(
    chunkId: number,
    pseudoEntityIndex: number,
    x: number,
    y: number,
  ): number;
  unload_tilemap_chunk_body?(chunkId: number): void;
  free?(): void;
}
