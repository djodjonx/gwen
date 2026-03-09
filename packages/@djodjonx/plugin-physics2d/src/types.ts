/**
 * Types for the GWEN 2D physics plugin.
 * All types are pure data — no WASM dependency.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

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
}

// ─── Collision events ─────────────────────────────────────────────────────────

/**
 * A contact event emitted by the physics simulation each frame.
 * Retrieved via `api.services.get('physics').getCollisionEvents()`.
 *
 * ## ⚠️ IMPORTANT — slotA/slotB are raw slot indices, NOT packed EntityIds
 *
 * Rapier stores and returns raw ECS slot indices (0–maxEntities), not the
 * 64-bit `EntityId` (bigint) used by the GWEN TypeScript ECS.
 *
 * To use these values with `api.getComponent()` or `api.destroyEntity()`,
 * you MUST reconstruct the EntityId using `createEntityId`:
 *
 * ```typescript
 * import { createEntityId } from '@gwen/engine-core';
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

/** Raw JSON shape returned by the Rust `get_collision_events()` export. */
interface RawCollisionEvent {
  a: number;
  b: number;
  started: boolean;
}

/** @deprecated Use readCollisionEventsFromBuffer instead. */
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
export function readCollisionEventsFromBuffer(buf: ArrayBuffer): CollisionEvent[] {
  const view = new DataView(buf);
  const writeHead = view.getUint32(0, true);
  const readHead = view.getUint32(4, true);
  const capacity = Math.floor((buf.byteLength - EVENT_HEADER_BYTES) / EVENT_STRIDE);

  if (writeHead === readHead) return [];

  const events: CollisionEvent[] = [];
  let idx = readHead;

  while (idx !== writeHead) {
    const offset = EVENT_HEADER_BYTES + idx * EVENT_STRIDE;
    // type (u16) at offset+0 — ignored for collision events (always 0)
    const slotA = view.getUint32(offset + 2, true);
    const slotB = view.getUint32(offset + 6, true);
    const flags = view.getUint8(offset + 10);
    events.push({ slotA, slotB, started: (flags & 1) === 1 });
    idx = (idx + 1) % capacity;
  }

  // Mark buffer as consumed — advance read_head to write_head
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
   * @returns Opaque `bodyHandle` to pass to `addBoxCollider` / `addBallCollider`.
   */
  addRigidBody(entityIndex: number, type: RigidBodyType, x: number, y: number): number;

  /**
   * Add an axis-aligned box collider to a body.
   * @param bodyHandle  Return value of `addRigidBody`.
   * @param hw          Half-width in metres.
   * @param hh          Half-height in metres.
   * @param opts        Optional restitution and friction overrides.
   */
  addBoxCollider(bodyHandle: number, hw: number, hh: number, opts?: ColliderOptions): void;

  /**
   * Add a ball (circle) collider to a body.
   * @param bodyHandle  Return value of `addRigidBody`.
   * @param radius      Radius in metres.
   * @param opts        Optional restitution and friction overrides.
   */
  addBallCollider(bodyHandle: number, radius: number, opts?: ColliderOptions): void;

  /** Remove the rigid body (and all its colliders) for an entity. */
  removeBody(entityIndex: number): void;

  /**
   * Directly set the position of a kinematic body.
   * Call every frame from TS to drive kinematic bodies — this is more
   * accurate than relying on the SAB sync (which is in pixels).
   */
  setKinematicPosition(entityIndex: number, x: number, y: number): void;

  /**
   * Apply an instantaneous linear impulse to a body.
   * Has no effect on `fixed` bodies.
   */
  applyImpulse(entityIndex: number, x: number, y: number): void;

  /**
   * Return the collision events produced during the last `step()`.
   * Call once per frame, after the WasmStep slot.
   */
  getCollisionEvents(): CollisionEvent[];

  /**
   * Return the current world position and rotation of an entity.
   * Returns `null` if the entity has no rigid body.
   */
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
  add_rigid_body(entityIndex: number, x: number, y: number, bodyType: number): number;
  add_box_collider(
    bodyHandle: number,
    hw: number,
    hh: number,
    restitution: number,
    friction: number,
  ): void;
  add_ball_collider(
    bodyHandle: number,
    radius: number,
    restitution: number,
    friction: number,
  ): void;
  remove_rigid_body(entityIndex: number): void;
  set_kinematic_position(entityIndex: number, x: number, y: number): void;
  apply_impulse(entityIndex: number, x: number, y: number): void;
  step(delta: number): void;
  get_position(entityIndex: number): number[];
  stats(): string;
  free?(): void;
}
