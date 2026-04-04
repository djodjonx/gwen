# Physics 2D API Reference

**Package:** `@gwenjs/physics2d`  
**Import:** `import { ... } from '@gwenjs/physics2d'`

## Composable Functions

### `useStaticBody(options?)`

Registers the current actor entity as a static (fixed) physics body.

```typescript
function useStaticBody(options?: StaticBodyOptions): StaticBodyHandle
```

See [Physics Composables Guide](/guide/physics-composables#usestaticbody-options) for full documentation.

---

### `useDynamicBody(options?)`

Registers the current actor entity as a dynamic (simulated) physics body.

```typescript
function useDynamicBody(options?: DynamicBodyOptions): DynamicBodyHandle
```

See [Physics Composables Guide](/guide/physics-composables#usedynamicbody-options) for full documentation.

---

### `useBoxCollider(options)`

Attaches an axis-aligned box collider to the current actor entity.

```typescript
function useBoxCollider(options: BoxColliderOptions): BoxColliderHandle
```

---

### `useSphereCollider(options)`

Attaches a circle (sphere) collider to the current actor entity.

```typescript
function useSphereCollider(options: SphereColliderOptions): CircleColliderHandle
```

---

### `useCapsuleCollider(options)`

Attaches a capsule collider (approximated as box) to the current actor entity.

```typescript
function useCapsuleCollider(options: CapsuleColliderOptions): CapsuleColliderHandle
```

---

### `defineLayers(definition)`

Declares named physics layers with bitmask values, validated at runtime.

```typescript
function defineLayers<T extends Record<string, number>>(
  definition: T
): { [K in keyof T]: number }
```

---

### `onContact(callback)`

Subscribes to collision contact events for the current actor entity.

```typescript
function onContact(callback: (contact: ContactEvent) => void): void
```

---

### `onSensorEnter(sensorId, callback)`

Subscribes to sensor overlap entry events.

```typescript
function onSensorEnter(sensorId: number, callback: (entityId: bigint) => void): void
```

---

### `onSensorExit(sensorId, callback)`

Subscribes to sensor overlap exit events.

```typescript
function onSensorExit(sensorId: number, callback: (entityId: bigint) => void): void
```

---

## Types

### `StaticBodyOptions`

```typescript
interface StaticBodyOptions {
  /** Collider shape. @default 'box' */
  shape?: 'box' | 'ball';
  /** Collision membership layer bitmask. */
  layer?: number;
  /** Collision filter mask bitmask. */
  mask?: number;
  /** Trigger-only (no physical response). @default false */
  isSensor?: boolean;
}
```

### `StaticBodyHandle`

```typescript
interface StaticBodyHandle {
  /** Opaque body handle returned by addRigidBody. */
  readonly bodyId: number;
  /** Whether the body is currently active. */
  readonly active: boolean;
  /** Re-activates the body (call after disable). */
  enable(): void;
  /** Removes the body from the simulation. */
  disable(): void;
}
```

### `DynamicBodyOptions`

```typescript
interface DynamicBodyOptions {
  /** Collider shape. @default 'box' */
  shape?: 'box' | 'ball';
  /** Collision membership layer bitmask. */
  layer?: number;
  /** Collision filter mask bitmask. */
  mask?: number;
  /** Mass in kg. @default 1 */
  mass?: number;
  /** Linear damping (air resistance). @default 0 */
  linearDamping?: number;
  /** Rotational damping. @default 0 */
  angularDamping?: number;
  /** Prevent rotation. @default false */
  fixedRotation?: boolean;
  /** Gravity scale multiplier. @default 1 */
  gravityScale?: number;
}
```

### `DynamicBodyHandle`

```typescript
interface DynamicBodyHandle {
  /** Opaque body handle returned by addRigidBody. */
  readonly bodyId: number;
  /** Whether the body is currently active. */
  readonly active: boolean;
  /** Current linear velocity in m/s. */
  readonly velocity: { x: number; y: number };
  /** No-op — Physics2DAPI has no applyForce. Use applyImpulse instead. */
  applyForce(fx: number, fy: number): void;
  /** Apply an instantaneous impulse in N·s. */
  applyImpulse(ix: number, iy: number): void;
  /** Override the linear velocity directly in m/s. */
  setVelocity(vx: number, vy: number): void;
  /** Re-activates the body. */
  enable(): void;
  /** Removes the body from the simulation. */
  disable(): void;
}
```

### `BoxColliderHandle`

```typescript
interface BoxColliderHandle {
  /** Opaque collider ID (same as bodyHandle from addRigidBody). */
  readonly colliderId: number;
  /** Whether this collider is a sensor. */
  readonly isSensor: boolean;
}
```

### `CircleColliderHandle`

```typescript
interface CircleColliderHandle {
  readonly colliderId: number;
  readonly isSensor: boolean;
}
```

### `CapsuleColliderHandle`

```typescript
interface CapsuleColliderHandle {
  readonly colliderId: number;
  readonly isSensor: boolean;
}
```

### `ContactEvent`

```typescript
interface ContactEvent {
  entityA: bigint;
  entityB: bigint;
  contactX: number;
  contactY: number;
  normalX: number;
  normalY: number;
  relativeVelocity: number;
}
```

### `ColliderOptions`

```typescript
interface ColliderOptions {
  /** Bounciness in [0, 1]. @default 0 */
  restitution?: number;
  /** Friction coefficient ≥ 0. @default 0.5 */
  friction?: number;
  /** Trigger-only. @default false */
  isSensor?: boolean;
  /** Collider density in kg/m². @default 1.0 */
  density?: number;
  /** Membership layer names or raw bitmask. @default 0xFFFFFFFF */
  membershipLayers?: string[] | number;
  /** Filter layer names or raw bitmask. @default 0xFFFFFFFF */
  filterLayers?: string[] | number;
  /** Stable collider ID propagated to collision events. */
  colliderId?: number;
  /** Local collider offset X in metres. */
  offsetX?: number;
  /** Local collider offset Y in metres. */
  offsetY?: number;
}
```

### `Physics2DAPI`

The service interface injected by the plugin. Access via `usePhysics2D()`.

```typescript
interface Physics2DAPI {
  addRigidBody(
    entityId: EntityId,
    type: 'fixed' | 'dynamic' | 'kinematic',
    x: number,
    y: number,
    opts?: {
      mass?: number;
      gravityScale?: number;
      linearDamping?: number;
      angularDamping?: number;
      initialVelocity?: { vx: number; vy: number };
      ccdEnabled?: boolean;
    }
  ): number; // returns bodyHandle

  addBoxCollider(bodyHandle: number, hw: number, hh: number, opts?: ColliderOptions): void;
  addBallCollider(bodyHandle: number, radius: number, opts?: ColliderOptions): void;

  removeBody(entityId: EntityId): void;
  applyImpulse(entityId: EntityId, x: number, y: number): void;
  setLinearVelocity(entityId: EntityId, vx: number, vy: number): void;
  getLinearVelocity(entityId: EntityId): { x: number; y: number } | null;

  getCollisionEventsBatch(opts?: { max?: number; coalesced?: boolean }): CollisionEventsBatch;
  getSensorState(entityId: EntityId, sensorId: number): SensorState;
  updateSensorState(entityId: EntityId, sensorId: number, started: boolean): void;
}
```

## Ring Buffer

The `ContactRingBuffer` class provides a zero-copy SAB-backed event queue for collision events delivered from the WASM simulation.

```typescript
import { ContactRingBuffer } from '@gwenjs/physics2d'

const buf = new ContactRingBuffer()

// Write (called by WASM bridge)
buf.write({ entityAIdx, entityBIdx, contactX, contactY, normalX, normalY, relativeVelocity })

// Drain once per frame
const events = buf.drain()
```

## Vite Plugin

The `physics2dVitePlugin()` provides build-time layer inlining:

```typescript
import { extractLayerDefinitions, inlineLayerReferences } from '@gwenjs/physics2d/vite-plugin'
```

- `extractLayerDefinitions(code)` — parses a `defineLayers({...})` call and returns a `Map<string, number>` of layer values.
- `inlineLayerReferences(code, variableName, layerMap)` — replaces `Layers.wall` with its literal value `4`.
