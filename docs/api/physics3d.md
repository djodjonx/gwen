# Physics 3D API Reference

**Package:** `@gwenjs/physics3d`
**RFC:** RFC-06 — Physics 3D DX Composables

This page documents the RFC-06 composable API, the SAB ring buffer, and the Vite plugin exported by `@gwenjs/physics3d`.

For the lower-level `Physics3DAPI` service (direct body management), see the [Physics 3D Plugin](/plugins/physics3d) page.

---

## `useStaticBody`

```typescript
function useStaticBody(options?: StaticBodyOptions3D): StaticBodyHandle3D
```

Registers the current actor entity as a fixed, non-moving 3D physics body.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `options` | `StaticBodyOptions3D` | Optional sensor and layer configuration |

**Returns** — `StaticBodyHandle3D`

### `StaticBodyOptions3D`

```typescript
interface StaticBodyOptions3D {
  isSensor?: boolean;        // default: false
  layer?: number;
  mask?: number;
  materialPreset?: Physics3DMaterialPreset;  // default: 'default'
}
```

### `StaticBodyHandle3D`

```typescript
interface StaticBodyHandle3D {
  readonly bodyId: number;
  readonly active: boolean;
  enable(): void;
  disable(): void;
}
```

| Member | Description |
|---|---|
| `bodyId` | Opaque numeric body id assigned by the physics engine |
| `active` | `true` when the body is registered in the simulation |
| `enable()` | Re-create the body (no-op when already active) |
| `disable()` | Remove the body from the simulation (no-op when already inactive) |

---

## `useDynamicBody`

```typescript
function useDynamicBody(options?: DynamicBodyOptions3D): DynamicBodyHandle3D
```

Registers the current actor entity as a fully simulated 3D physics body.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `options` | `DynamicBodyOptions3D` | Mass, damping, CCD, initial state, and layer config |

**Returns** — `DynamicBodyHandle3D`

### `DynamicBodyOptions3D`

```typescript
interface DynamicBodyOptions3D {
  mass?: number;                               // default: 1 (kg)
  gravityScale?: number;                       // default: 1
  linearDamping?: number;                      // default: 0
  angularDamping?: number;                     // default: 0
  ccdEnabled?: boolean;                        // default: false
  isSensor?: boolean;                          // default: false
  layer?: number;
  mask?: number;
  materialPreset?: Physics3DMaterialPreset;    // default: 'default'
  initialPosition?: Partial<Physics3DVec3>;
  initialRotation?: Partial<Physics3DQuat>;
  initialLinearVelocity?: Partial<Physics3DVec3>;
  initialAngularVelocity?: Partial<Physics3DVec3>;
}
```

### `DynamicBodyHandle3D`

Extends `StaticBodyHandle3D`.

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

| Member | Unit | Description |
|---|---|---|
| `applyForce(fx, fy, fz)` | N | Apply continuous force (mapped to impulse internally) |
| `applyImpulse(ix, iy, iz)` | N·s | Apply instantaneous linear impulse |
| `applyTorque(tx, ty, tz)` | N·m | Apply continuous torque |
| `setVelocity(vx, vy, vz)` | m/s | Set linear velocity directly |
| `velocity` | m/s | Current linear velocity (zero vector when inactive) |
| `angularVelocity` | rad/s | Current angular velocity (zero vector when inactive) |

---

## `useBoxCollider`

```typescript
function useBoxCollider(options: BoxColliderOptions3D): BoxColliderHandle3D
```

Attaches a box-shaped collider to the current entity.

### `BoxColliderOptions3D`

```typescript
interface BoxColliderOptions3D {
  w: number;                           // full width (half-extent = w/2)
  h: number;                           // full height
  d?: number;                          // full depth (default: w)
  offsetX?: number;                    // local-space X offset
  offsetY?: number;                    // local-space Y offset
  offsetZ?: number;                    // local-space Z offset
  isSensor?: boolean;                  // default: false
  layer?: number;
  mask?: number;
  material?: Physics3DMaterialPreset;  // default: 'default'
}
```

**Returns** — `BoxColliderHandle3D` (alias for `ColliderHandle3D`)

---

## `useSphereCollider`

```typescript
function useSphereCollider(options: SphereColliderOptions3D): SphereColliderHandle3D
```

### `SphereColliderOptions3D`

```typescript
interface SphereColliderOptions3D {
  radius: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  isSensor?: boolean;
  layer?: number;
  mask?: number;
  material?: Physics3DMaterialPreset;
}
```

---

## `useCapsuleCollider`

```typescript
function useCapsuleCollider(options: CapsuleColliderOptions3D): CapsuleColliderHandle3D
```

### `CapsuleColliderOptions3D`

```typescript
interface CapsuleColliderOptions3D {
  radius: number;
  height: number;                      // cylinder height (not including end-caps)
  axis?: 'x' | 'y' | 'z';             // default: 'y'
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  isSensor?: boolean;
  layer?: number;
  mask?: number;
  material?: Physics3DMaterialPreset;
}
```

---

## `useMeshCollider` — 3D only

> ⚠️ Not available in `@gwenjs/physics2d`.

```typescript
function useMeshCollider(options: MeshColliderOptions): MeshColliderHandle3D
```

### `MeshColliderOptions`

```typescript
interface MeshColliderOptions {
  vertices: Float32Array;   // [x0, y0, z0, x1, y1, z1, ...]
  indices: Uint32Array;     // [a0, b0, c0, a1, b1, c1, ...]
  isSensor?: boolean;
  layer?: number;
  mask?: number;
}
```

**Constraints:**
- `vertices.length` must be a multiple of 3
- `indices.length` must be a multiple of 3
- Best suited for static bodies only

---

## `useConvexCollider` — 3D only

> ⚠️ Not available in `@gwenjs/physics2d`.

```typescript
function useConvexCollider(options: ConvexColliderOptions): ConvexColliderHandle3D
```

### `ConvexColliderOptions`

```typescript
interface ConvexColliderOptions {
  vertices: Float32Array;              // [x0, y0, z0, x1, y1, z1, ...]
  isSensor?: boolean;
  layer?: number;
  mask?: number;
  material?: Physics3DMaterialPreset;
}
```

The Rapier3D engine automatically computes the convex hull from the vertex point cloud.

---

## `ColliderHandle3D`

All collider composables return a value that implements this interface:

```typescript
interface ColliderHandle3D {
  readonly colliderId: number;  // Stable numeric id
  remove(): void;               // Remove from entity
}
```

Named aliases for each collider type:

```typescript
type BoxColliderHandle3D     = ColliderHandle3D;
type SphereColliderHandle3D  = ColliderHandle3D;
type CapsuleColliderHandle3D = ColliderHandle3D;
type MeshColliderHandle3D    = ColliderHandle3D;
type ConvexColliderHandle3D  = ColliderHandle3D;
```

---

## `defineLayers`

```typescript
function defineLayers<T extends Record<string, number>>(
  definition: T
): { [K in keyof T]: number }
```

Defines named collision layer bitmasks. Emits `console.warn` when any two values share bits.

**Example**

```typescript
const Layers = defineLayers({
  player:  1,
  enemy:   2,
  ground:  4,
  trigger: 8,
})
// Layers.player === 1, Layers.ground === 4, etc.
```

**Vite plugin inlining:** When the `gwen:physics3d` Vite plugin is active (registered automatically by `physics3dModule`), all `Layers.xxx` references are replaced with numeric literals at build time, enabling dead-code elimination.

---

## `onContact`

```typescript
function onContact(callback: (contact: ContactEvent3D) => void): void
```

Register a per-frame callback for 3D contact events.

### `ContactEvent3D`

```typescript
interface ContactEvent3D {
  entityA: bigint;          // Packed slot index of the first body
  entityB: bigint;          // Packed slot index of the second body
  contactX: number;         // World-space contact point X (metres)
  contactY: number;         // World-space contact point Y
  contactZ: number;         // World-space contact point Z (3D only)
  normalX: number;          // Contact normal X (unit vector B → A)
  normalY: number;          // Contact normal Y
  normalZ: number;          // Contact normal Z (3D only)
  relativeVelocity: number; // Impact velocity magnitude (m/s)
  restitution: number;      // Effective restitution coefficient
}
```

Events are delivered from a `SharedArrayBuffer` ring buffer with 512-slot capacity. For scenes with very high collision rates, filter on `relativeVelocity` before triggering expensive gameplay logic.

---

## `onSensorEnter`

```typescript
function onSensorEnter(sensorId: number, callback: (entityId: bigint) => void): void
```

Register a callback invoked when an entity enters a sensor zone. `sensorId` is the `colliderId` returned by a collider composable.

---

## `onSensorExit`

```typescript
function onSensorExit(sensorId: number, callback: (entityId: bigint) => void): void
```

Register a callback invoked when an entity exits a sensor zone.

---

## `ContactRingBuffer3D`

```typescript
class ContactRingBuffer3D {
  constructor(sab?: SharedArrayBuffer);
  get sab(): SharedArrayBuffer;
  drain(): ContactEvent3D[];
  write(event: { ... }): void;
}
```

Zero-copy SAB ring buffer for 3D collision event delivery. Normally used internally by the physics plugin. Exposed for advanced use cases — e.g., replaying recorded collisions in tests or writing a custom WASM bridge.

**Constants**

```typescript
const CONTACT_EVENT_FLOATS: 10;   // f32 slots per event record
const RING_CAPACITY_3D: 512;      // maximum events in the buffer
```

**Memory layout per slot** (40 bytes):

| Index | View | Description |
|---|---|---|
| 0 | `Uint32Array` | entityA slot index |
| 1 | `Uint32Array` | entityB slot index |
| 2 | `Float32Array` | contactX |
| 3 | `Float32Array` | contactY |
| 4 | `Float32Array` | contactZ |
| 5 | `Float32Array` | normalX |
| 6 | `Float32Array` | normalY |
| 7 | `Float32Array` | normalZ |
| 8 | `Float32Array` | relativeVelocity |
| 9 | `Float32Array` | restitution |

---

## `physics3dVitePlugin`

```typescript
function physics3dVitePlugin(options?: Physics3DVitePluginOptions): Plugin
```

Vite plugin for Physics 3D build-time optimisations. Automatically registered by `physics3dModule`. Can also be added manually:

```typescript
// vite.config.ts
import { physics3dVitePlugin } from '@gwenjs/physics3d'

export default {
  plugins: [physics3dVitePlugin({ debug: true })],
}
```

### `Physics3DVitePluginOptions`

```typescript
interface Physics3DVitePluginOptions {
  debug?: boolean;  // Log inlining activity. default: false
}
```

**Current transformations:**
- `defineLayers` constant inlining (replaces `Layers.xxx` with numeric literals)

---

## Internal / Test Utilities

These are exported for testing and plugin teardown. Not intended for direct use in game code:

| Export | Description |
|---|---|
| `_dispatchContactEvent(event)` | Dispatch to all `onContact` callbacks |
| `_clearContactCallbacks()` | Remove all `onContact` callbacks |
| `_dispatchSensorEnter(sensorId, entityId)` | Dispatch to matching `onSensorEnter` callbacks |
| `_dispatchSensorExit(sensorId, entityId)` | Dispatch to matching `onSensorExit` callbacks |
| `_clearSensorCallbacks()` | Remove all sensor callbacks |
| `extractLayerDefinitions(code)` | Parse `defineLayers(...)` from source (Vite plugin util) |
| `inlineLayerReferences(code, varName, map)` | Replace layer references with literals |
