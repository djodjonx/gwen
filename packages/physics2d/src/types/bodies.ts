/**
 * Rigid body and collider configuration types.
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

export type ColliderShape = 'box' | 'ball';

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

export interface BoxColliderHandle {
  /** Unique collider ID assigned by the physics engine. */
  readonly colliderId: number;
  /** Whether this collider is a sensor. */
  readonly isSensor: boolean;
}

export interface CircleColliderHandle {
  /** Unique collider ID assigned by the physics engine. */
  readonly colliderId: number;
  /** Whether this collider is a sensor. */
  readonly isSensor: boolean;
}

export interface CapsuleColliderHandle {
  /** Unique collider ID assigned by the physics engine. */
  readonly colliderId: number;
  /** Whether this collider is a sensor. */
  readonly isSensor: boolean;
}

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

export interface Physics2DLayerDefinition {
  [key: string]: number;
}

export type PhysicsGroundedRole = 'none' | 'head' | 'body' | 'foot';
