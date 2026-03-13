/**
 * Types for the GWEN 2D physics plugin.
 * All types are pure data — no WASM dependency.
 */

import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { EngineAPI } from '@djodjonx/gwen-engine-core';

// ─── Config ───────────────────────────────────────────────────────────────────

export type PhysicsQualityPreset = 'low' | 'medium' | 'high' | 'esport';
export type PhysicsEventMode = 'pull' | 'hybrid';

export interface PhysicsCompatFlags {
  /** Keep legacy top-level prefab collider props (`hw/hh/radius`) enabled. @default true */
  legacyPrefabColliderProps?: boolean;
  /** Keep legacy JSON collision parser helper enabled. @default true */
  legacyCollisionJsonParser?: boolean;
}

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
   * Compatibility switches for transitional releases.
   * @default { legacyPrefabColliderProps: true, legacyCollisionJsonParser: true }
   */
  compat?: PhysicsCompatFlags;
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
}

// ─── Collision events ─────────────────────────────────────────────────────────

/**
 * A contact event emitted by the physics simulation each frame.
 * Retrieved via `api.services.get('physics').getCollisionEvents()`.
 *
 * ## ⚠️ IMPORTANT — slotA/slotB are raw slot indices, NOT packed EntityId
 *
 * Rapier stores and returns raw ECS slot indices (0–maxEntities), not the
 * 64-bit `EntityId` (bigint) used by the GWEN TypeScript ECS.
 *
 * To use these values with `api.getComponent()` or `api.destroyEntity()`,
 * you MUST reconstruct the EntityId using `createEntityId`:
 *
 * ```typescript
 * import { createEntityId } from '@djodjonx/gwen-engine-core';
 *
 * for (const { slotA, slotB, started } of physics.getCollisionEvents()) {
 *   const entityA = createEntityId(slotA, api.getEntityGeneration(slotA));
 *   const entityB = createEntityId(slotB, api.getEntityGeneration(slotB));
 *   const tagA = api.getComponent(entityA, Tag);
 * }
 * ```
 */
export interface CollisionEvent {
  /** Raw ECS slot index of the first participant. NOT a packed EntityId. */
  slotA: number;
  /** Raw ECS slot index of the second participant. NOT a packed EntityId. */
  slotB: number;
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
 * api.hooks.hook('physics:collision', (contacts) => {
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
  /** Raw slot index of `entityA` (for `physics.removeBody()`). */
  slotA: number;
  /** Raw slot index of `entityB`. */
  slotB: number;
  /** `true` = contact started this frame, `false` = contact ended. */
  started: boolean;
}

// ─── Hooks provided by this plugin ───────────────────────────────────────────

/**
 * Hooks emitted by the Physics2D plugin.
 *
 * Declared as `providesHooks` on the plugin so that `gwen prepare` can
 * augment `GwenDefaultHooks` — giving full type-safety on
 * `api.hooks.hook('physics:collision', ...)` without any cast.
 *
 * @example
 * ```typescript
 * // After gwen prepare — fully typed, no cast needed
 * api.hooks.hook('physics:collision', (contacts) => { ... });
 * ```
 */
export interface Physics2DPluginHooks {
  /**
   * Fired once per frame (during `onUpdate`) with all resolved collision contacts.
   * Handlers receive a **read-only snapshot** — do not mutate the array.
   *
   * @param contacts Array of resolved collision contacts for this frame.
   */
  'physics:collision': (contacts: ReadonlyArray<CollisionContact>) => void;
  /**
   * Optional convenience hook emitted at most once per frame when `eventMode` is `hybrid`.
   * Prefer the pull API in gameplay hot paths.
   */
  'physics:collision:batch': (batch: Readonly<CollisionEventsBatch>) => void;
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

export type PhysicsColliderShape = 'box' | 'ball';

export interface PhysicsColliderDef extends PhysicsMaterialPreset {
  id?: string;
  shape: PhysicsColliderShape;
  hw?: number;
  hh?: number;
  radius?: number;
  offsetX?: number;
  offsetY?: number;
  isSensor?: boolean;
  /** Named layers this collider belongs to. */
  membershipLayers?: string[] | number;
  /** Named layers this collider can collide with. */
  filterLayers?: string[] | number;
}

export interface Physics2DPrefabExtension {
  /** How the body participates in the simulation. */
  bodyType?: RigidBodyType;

  /**
   * Preferred vNext collider schema.
   * If omitted, legacy top-level collider props are adapted automatically.
   */
  colliders?: PhysicsColliderDef[];

  // ── Legacy mono-collider props (deprecated, TS compatibility only) ──
  /** @deprecated Since 0.4.0. Use `colliders[0].radius`. Removal planned in 1.0.0. */
  radius?: number;
  /** @deprecated Since 0.4.0. Use `colliders[0].hw`. Removal planned in 1.0.0. */
  hw?: number;
  /** @deprecated Since 0.4.0. Use `colliders[0].hh`. Removal planned in 1.0.0. */
  hh?: number;

  /** @deprecated Since 0.4.0. Use `colliders[].restitution`. Removal planned in 1.0.0. */
  restitution?: number;
  /** @deprecated Since 0.4.0. Use `colliders[].friction`. Removal planned in 1.0.0. */
  friction?: number;
  /** @deprecated Since 0.4.0. Use `colliders[].isSensor`. Removal planned in 1.0.0. */
  isSensor?: boolean;
  /** @deprecated Since 0.4.0. Use `colliders[].density`. Removal planned in 1.0.0. */
  density?: number;

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
  onCollision?: (
    self: EntityId,
    other: EntityId,
    contact: CollisionContact,
    api: EngineAPI,
  ) => void;
}

/** Bridge schema version shared by TS and Rust wasm-bindgen exports. */
export const PHYSICS2D_BRIDGE_SCHEMA_VERSION = 1;
/** Binary ring format version for the `events` channel. */
export const PHYSICS2D_EVENTS_RING_FORMAT_VERSION = 1;

/** Raw JSON shape returned by the legacy Rust `get_collision_events()` export. */
interface RawCollisionEvent {
  a: number;
  b: number;
  started: boolean;
}

// ─── Collision event parsing ─────────────────────────────────────────────────

/** @deprecated Since 0.4.0. Use `readCollisionEventsFromBuffer` with typed views. Removal planned in 1.0.0. */
export function parseCollisionEvents(json: string): CollisionEvent[] {
  const raw: RawCollisionEvent[] = JSON.parse(json);
  return raw.map((e) => ({ slotA: e.a, slotB: e.b, started: e.started }));
}

// ─── Binary event reader ──────────────────────────────────────────────────────

const EVENT_HEADER_BYTES = 8;
const EVENT_STRIDE = 11;

/**
 * Read all pending collision events from a ring-buffer channel buffer.
 *
 * Format:
 * - Header 8 bytes: [write_head u32 LE][read_head u32 LE]
 * - Each event (11 bytes): [type u16][slotA u32][slotB u32][flags u8]
 *   - flags bit 0: 1 = started, 0 = ended
 *
 * Advances `read_head` to `write_head` (marks the buffer as consumed).
 */
export function readCollisionEventsFromBuffer(bufOrView: ArrayBuffer | DataView): CollisionEvent[] {
  void PHYSICS2D_EVENTS_RING_FORMAT_VERSION;
  const view = bufOrView instanceof DataView ? bufOrView : new DataView(bufOrView);
  const writeHead = view.getUint32(0, true);
  const readHead = view.getUint32(4, true);
  const capacity = Math.floor((view.byteLength - EVENT_HEADER_BYTES) / EVENT_STRIDE);

  if (capacity <= 0 || writeHead === readHead) return [];

  const events: CollisionEvent[] = [];
  let idx = readHead;

  while (idx !== writeHead) {
    const offset = EVENT_HEADER_BYTES + idx * EVENT_STRIDE;
    const slotA = view.getUint32(offset + 2, true);
    const slotB = view.getUint32(offset + 6, true);
    const flags = view.getUint8(offset + 10);
    events.push({ slotA, slotB, started: (flags & 1) === 1 });
    idx = (idx + 1) % capacity;
  }

  view.setUint32(4, writeHead, true);
  return events;
}

// ─── Physics2D service API ────────────────────────────────────────────────────

/**
 * Service exposed in `api.services.get('physics')` after the plugin is initialized.
 *
 * @example
 * ```typescript
 * onInit(api) {
 *   const physics = api.services.get('physics') as Physics2DAPI;
 *   const handle = physics.addRigidBody(entityIndex, 'dynamic', 0, 10);
 *   physics.addBoxCollider(handle, 0.5, 0.5);
 * }
 * onUpdate(api) {
 *   for (const ev of (api.services.get('physics') as Physics2DAPI).getCollisionEvents()) {
 *     console.log('collision', ev.entityA, ev.entityB);
 *   }
 * }
 * ```
 */
export interface Physics2DAPI {
  /**
   * Register a rigid body for an entity.
   * @param entityIndex  Raw `EntityId.index` (slot only — not packed).
   * @param type         Body simulation type.
   * @param x            Initial world position X in metres.
   * @param y            Initial world position Y in metres.
   * @param opts         Optional body properties (mass, gravityScale, damping, initialVelocity).
   * @returns Opaque `bodyHandle` to pass to `addBoxCollider` / `addBallCollider`.
   */
  addRigidBody(
    entityIndex: number,
    type: RigidBodyType,
    x: number,
    y: number,
    opts?: Pick<ColliderOptions, never> & {
      mass?: number;
      gravityScale?: number;
      linearDamping?: number;
      angularDamping?: number;
      initialVelocity?: { vx: number; vy: number };
    },
  ): number;

  /**
   * Add an axis-aligned box collider to a body.
   * @param bodyHandle  Return value of `addRigidBody`.
   * @param hw          Half-width in metres.
   * @param hh          Half-height in metres.
   * @param opts        Optional material, sensor and density overrides.
   */
  addBoxCollider(bodyHandle: number, hw: number, hh: number, opts?: ColliderOptions): void;

  /**
   * Add a ball (circle) collider to a body.
   * @param bodyHandle  Return value of `addRigidBody`.
   * @param radius      Radius in metres.
   * @param opts        Optional material, sensor and density overrides.
   */
  addBallCollider(bodyHandle: number, radius: number, opts?: ColliderOptions): void;

  /** Remove the rigid body (and all its colliders) for an entity. */
  removeBody(entityIndex: number): void;

  /** Directly set the position of a kinematic body (metres). */
  setKinematicPosition(entityIndex: number, x: number, y: number): void;

  /** Apply an instantaneous linear impulse to a body (N·s). */
  applyImpulse(entityIndex: number, x: number, y: number): void;

  /** Set the linear velocity of a body directly (m/s). */
  setLinearVelocity(entityIndex: number, vx: number, vy: number): void;

  /** Read current linear velocity (m/s). */
  getLinearVelocity(entityIndex: number): { x: number; y: number } | null;

  /**
   * Pull-first collision API. Equivalent to `getCollisionEvents()` but explicit.
   *
   * `coalesced` is reserved for future behavior and currently ignored.
   */
  getCollisionEventsBatch(opts?: { max?: number; coalesced?: boolean }): CollisionEventsBatch;

  /**
   * @deprecated Since 0.4.0. Use `getCollisionEventsBatch().events` instead. Removal planned in 1.0.0.
   */
  getCollisionEvents(): CollisionEvent[];

  /** Return the current world position and rotation of an entity. */
  getPosition(entityIndex: number): { x: number; y: number; rotation: number } | null;
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
  /** Bridge schema version for TS/WASM compatibility checks. */
  bridge_schema_version?(): number;
  free?(): void;
}
