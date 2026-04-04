# Physics 3D Composables

**Package:** `@gwenjs/physics3d` — RFC-06 DX Composables

This guide covers the RFC-06 composable API for `@gwenjs/physics3d`. These composables provide an ergonomic, actor-centric way to work with 3D physics without manually calling the lower-level `Physics3DAPI` service methods.

> **3D-specific note:** All coordinates include a Z axis. Two collider shapes — `useMeshCollider` and `useConvexCollider` — are only available in `@gwenjs/physics3d` and have no equivalent in `@gwenjs/physics2d`.

---

## Overview

RFC-06 adds a set of composable functions that mirror the developer experience of popular 3D frameworks:

| Composable | Purpose |
|---|---|
| `useStaticBody()` | Non-moving body (walls, terrain, obstacles) |
| `useDynamicBody()` | Fully simulated body (characters, projectiles) |
| `useBoxCollider()` | Axis-aligned box collision shape |
| `useSphereCollider()` | Sphere collision shape |
| `useCapsuleCollider()` | Capsule collision shape (great for characters) |
| `useMeshCollider()` | Triangle mesh shape (3D only) |
| `useConvexCollider()` | Convex hull shape (3D only) |
| `defineLayers()` | Named collision layer bitmask definitions |
| `onContact()` | Per-frame contact event callbacks |
| `onSensorEnter()` | Sensor zone entry callbacks |
| `onSensorExit()` | Sensor zone exit callbacks |

All composables are automatically imported when you add the `@gwenjs/physics3d` module to your GWEN config.

---

## `useStaticBody`

Register the current actor's entity as a **fixed, non-moving** physics body. Static bodies participate in collision detection but are never displaced by the simulation.

### Signature

```typescript
function useStaticBody(options?: StaticBodyOptions3D): StaticBodyHandle3D
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `isSensor` | `boolean` | `false` | Generates events but no physical response |
| `layer` | `number` | — | Collision layer bitmask (membership) |
| `mask` | `number` | — | Collision filter bitmask (what to collide with) |
| `materialPreset` | `Physics3DMaterialPreset` | `'default'` | Built-in material |

### Handle

```typescript
interface StaticBodyHandle3D {
  readonly bodyId: number;
  readonly active: boolean;
  enable(): void;
  disable(): void;
}
```

### Example — Wall

```typescript
const WallActor = defineActor(WallPrefab, () => {
  useStaticBody()
  useBoxCollider({ w: 2, h: 4, d: 0.5 })
})
```

### Example — Toggle on/off at runtime

```typescript
const DoorActor = defineActor(DoorPrefab, () => {
  const body = useStaticBody()
  useBoxCollider({ w: 1.5, h: 3, d: 0.2 })

  onEvent('door:open', () => body.disable())
  onEvent('door:close', () => body.enable())
})
```

---

## `useDynamicBody`

Register the current actor's entity as a **fully simulated** dynamic physics body. Dynamic bodies respond to gravity, forces, impulses, and collisions.

### Signature

```typescript
function useDynamicBody(options?: DynamicBodyOptions3D): DynamicBodyHandle3D
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `mass` | `number` | `1` | Body mass in kg. Values ≤ 0 are clamped to 0.0001 |
| `gravityScale` | `number` | `1` | Gravity multiplier. `0` = no gravity |
| `linearDamping` | `number` | `0` | Linear velocity damping coefficient |
| `angularDamping` | `number` | `0` | Angular velocity damping coefficient |
| `ccdEnabled` | `boolean` | `false` | Enable CCD for fast-moving bodies |
| `isSensor` | `boolean` | `false` | Generates events but no physical response |
| `initialPosition` | `Partial<Physics3DVec3>` | — | Initial position in metres |
| `initialRotation` | `Partial<Physics3DQuat>` | — | Initial orientation (unit quaternion) |
| `initialLinearVelocity` | `Partial<Physics3DVec3>` | — | Initial velocity in m/s |
| `initialAngularVelocity` | `Partial<Physics3DVec3>` | — | Initial angular velocity in rad/s |

### Handle

```typescript
interface DynamicBodyHandle3D extends StaticBodyHandle3D {
  applyForce(fx: number, fy: number, fz: number): void;
  applyImpulse(ix: number, iy: number, iz: number): void;
  applyTorque(tx: number, ty: number, tz: number): void;
  setVelocity(vx: number, vy: number, vz: number): void;
  readonly velocity: Physics3DVec3;
  readonly angularVelocity: Physics3DVec3;
}
```

> **Note on `applyForce`:** Internally maps to `applyImpulse` because the Rapier3D WASM bridge processes forces as per-step impulses. For gameplay code, the distinction rarely matters.

### Example — Bouncing ball

```typescript
const BallActor = defineActor(BallPrefab, () => {
  const body = useDynamicBody({ mass: 2, ccdEnabled: true })
  useSphereCollider({ radius: 0.5, material: 'rubber' })

  // Launch upward at spawn
  body.applyImpulse(0, 15, 0)
})
```

### Example — Character controller

```typescript
const PlayerActor = defineActor(PlayerPrefab, () => {
  const body = useDynamicBody({
    mass: 80,
    linearDamping: 0.3,
    gravityScale: 1,
    ccdEnabled: true,
  })
  useCapsuleCollider({ radius: 0.4, height: 1.8 })

  onStep(() => {
    const vel = body.velocity
    if (input.isHeld('jump') && Math.abs(vel.y) < 0.1) {
      body.applyImpulse(0, 600, 0)
    }
  })
})
```

---

## Colliders

Colliders define the collision shape attached to a body. Always call a collider composable **after** `useStaticBody()` or `useDynamicBody()`.

All collider handles share this interface:

```typescript
interface ColliderHandle3D {
  readonly colliderId: number;
  remove(): void;
}
```

### `useBoxCollider`

```typescript
function useBoxCollider(options: BoxColliderOptions3D): BoxColliderHandle3D
```

| Option | Type | Default | Description |
|---|---|---|---|
| `w` | `number` | — | Full width (half-extent = w/2) |
| `h` | `number` | — | Full height |
| `d` | `number` | `w` | Full depth (defaults to `w` for a square cross-section) |
| `offsetX/Y/Z` | `number` | `0` | Local-space offset |
| `isSensor` | `boolean` | `false` | — |
| `material` | `Physics3DMaterialPreset` | `'default'` | — |

```typescript
useBoxCollider({ w: 10, h: 1, d: 4 })  // 10×1×4 platform
```

### `useSphereCollider`

```typescript
function useSphereCollider(options: SphereColliderOptions3D): SphereColliderHandle3D
```

```typescript
useSphereCollider({ radius: 0.5 })
```

### `useCapsuleCollider`

```typescript
function useCapsuleCollider(options: CapsuleColliderOptions3D): CapsuleColliderHandle3D
```

| Option | Type | Default | Description |
|---|---|---|---|
| `radius` | `number` | — | Capsule radius |
| `height` | `number` | — | Cylinder height (not including end-caps) |
| `axis` | `'x' \| 'y' \| 'z'` | `'y'` | Primary axis |

```typescript
useCapsuleCollider({ radius: 0.4, height: 1.8 })  // character shape
```

### `useMeshCollider` — 3D only

> ⚠️ **Not available in `@gwenjs/physics2d`.**

A trimesh collider uses exact triangle geometry for concave static objects such as terrain.

```typescript
function useMeshCollider(options: MeshColliderOptions): MeshColliderHandle3D
```

| Option | Type | Description |
|---|---|---|
| `vertices` | `Float32Array` | Flat `[x,y,z, x,y,z, ...]` vertex array |
| `indices` | `Uint32Array` | Triangle indices `[a,b,c, ...]` |
| `isSensor` | `boolean` | — |

```typescript
useStaticBody()
useMeshCollider({ vertices: terrainVerts, indices: terrainIndices })
```

> **Performance tip:** Use mesh colliders only on static bodies. Dynamic bodies with mesh colliders are expensive in the Rapier3D solver. Prefer `useConvexCollider` for dynamic geometry.

### `useConvexCollider` — 3D only

> ⚠️ **Not available in `@gwenjs/physics2d`.**

A convex hull collider automatically computes the smallest convex shape that contains a point cloud. Suitable for dynamic bodies when primitives are not a close enough approximation.

```typescript
function useConvexCollider(options: ConvexColliderOptions): ConvexColliderHandle3D
```

| Option | Type | Description |
|---|---|---|
| `vertices` | `Float32Array` | Flat `[x,y,z, ...]` point cloud |
| `isSensor` | `boolean` | — |
| `material` | `Physics3DMaterialPreset` | — |

```typescript
useDynamicBody({ mass: 50 })
useConvexCollider({ vertices: crateHullPoints })
```

---

## `defineLayers`

Define named collision layer bitmasks. Each value should be a unique power-of-two so that layers can be combined with bitwise OR.

```typescript
function defineLayers<T extends Record<string, number>>(definition: T): { [K in keyof T]: number }
```

If any two entries share overlapping bits, a `console.warn` is emitted at runtime.

The `gwen:physics3d` Vite plugin inlines these constants at build time, eliminating the `defineLayers` call from the production bundle.

### Example

```typescript
export const Layers = defineLayers({
  player:  0b00001,  // 1
  enemy:   0b00010,  // 2
  ground:  0b00100,  // 4
  trigger: 0b01000,  // 8
  bullet:  0b10000,  // 16
})

// Use with a dynamic body
useDynamicBody({
  layer: Layers.player,
  mask: Layers.ground | Layers.enemy | Layers.bullet,
})
```

---

## Contact Events

`onContact` registers a callback invoked for every `ContactEvent3D` dispatched in the current frame by the physics plugin.

```typescript
function onContact(callback: (contact: ContactEvent3D) => void): void
```

### `ContactEvent3D` fields

| Field | Type | Description |
|---|---|---|
| `entityA` | `bigint` | Packed slot index of the first body |
| `entityB` | `bigint` | Packed slot index of the second body |
| `contactX` | `number` | World-space contact point X (metres) |
| `contactY` | `number` | World-space contact point Y |
| `contactZ` | `number` | World-space contact point Z (**3D only**) |
| `normalX` | `number` | Contact normal X (unit vector B → A) |
| `normalY` | `number` | Contact normal Y |
| `normalZ` | `number` | Contact normal Z (**3D only**) |
| `relativeVelocity` | `number` | Magnitude of impact velocity in m/s |
| `restitution` | `number` | Effective restitution coefficient |

Events are delivered via a `SharedArrayBuffer` ring buffer (`ContactRingBuffer3D`) with 512-slot capacity. For high-collision scenes, consider filtering by `relativeVelocity` to reduce callback overhead.

### Example — Impact sound

```typescript
onContact((contact) => {
  if (contact.relativeVelocity > 3) {
    const vol = Math.min(contact.relativeVelocity / 20, 1)
    audio.playSfx('impact', { volume: vol, x: contact.contactX, y: contact.contactY, z: contact.contactZ })
  }
})
```

---

## Sensor Events

`onSensorEnter` and `onSensorExit` register callbacks for when entities enter or exit a sensor zone. Sensors are colliders with `isSensor: true` — they generate events but cause no physical displacement.

```typescript
function onSensorEnter(sensorId: number, callback: (entityId: bigint) => void): void
function onSensorExit(sensorId: number, callback: (entityId: bigint) => void): void
```

### Example — Trigger zone

```typescript
const CheckpointActor = defineActor(CheckpointPrefab, () => {
  useStaticBody()
  const zone = useBoxCollider({ w: 4, h: 3, d: 4, isSensor: true })

  onSensorEnter(zone.colliderId, (entityId) => {
    game.triggerCheckpoint(entityId)
  })
})
```

---

## 3D-Only Features

The following features exist only in `@gwenjs/physics3d` and have no counterpart in `@gwenjs/physics2d`:

| Feature | Reason |
|---|---|
| `useMeshCollider` | Triangle mesh shapes require 3D geometry (`vertices: Float32Array`, `indices: Uint32Array`) |
| `useConvexCollider` | Convex hull computation is 3D by definition |
| `contactZ`, `normalZ` in `ContactEvent3D` | Third axis only exists in 3D |
| `Physics3DVec3.z` on all velocity/position fields | Second axis (`z`) is unused in 2D |
| Capsule `axis` option | 2D capsules don't have a configurable axis |

---

## Migrating from 2D to 3D

If you are porting a `@gwenjs/physics2d` project to `@gwenjs/physics3d`:

| 2D | 3D equivalent | Notes |
|---|---|---|
| `useStaticBody2D()` | `useStaticBody()` | Same API |
| `useDynamicBody2D()` | `useDynamicBody()` | Add `z` where needed |
| `useBoxCollider2D({ w, h })` | `useBoxCollider({ w, h, d })` | Add `d` (depth) |
| `useCircleCollider()` | `useSphereCollider({ radius })` | Renamed |
| `useCapsuleCollider2D()` | `useCapsuleCollider()` | Add `axis` option |
| `usePolygonCollider()` | `useConvexCollider({ vertices })` | Float32Array in 3D |
| N/A | `useMeshCollider()` | 3D-only, no 2D equivalent |
| `defineLayers()` | `defineLayers()` | Identical API |
| `onContact({ x, y })` | `onContact({ contactX, contactY, contactZ, normalZ })` | Z fields added |
| `onSensorEnter()` | `onSensorEnter()` | Identical API |

All gravity, position, velocity, and force values gain a `z` component in 3D.
