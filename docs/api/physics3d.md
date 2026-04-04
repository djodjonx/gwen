# Physics 3D API Reference

**Package:** `@gwenjs/physics3d`
**RFC:** RFC-06 — Physics 3D DX Composables

This page documents the RFC-06 composable API, the SAB ring buffer, and the Vite plugin exported by `@gwenjs/physics3d`.

For the lower-level `Physics3DAPI` service (direct body management), see the [Physics 3D Plugin](/plugins/physics3d) page.

---

## `useStaticBody`

```typescript
function useStaticBody(options?: StaticBodyOptions3D): StaticBodyHandle3D;
```

Registers the current actor entity as a fixed, non-moving 3D physics body.

**Parameters**

| Name      | Type                  | Description                             |
| --------- | --------------------- | --------------------------------------- |
| `options` | `StaticBodyOptions3D` | Optional sensor and layer configuration |

**Returns** — `StaticBodyHandle3D`

### `StaticBodyOptions3D`

```typescript
interface StaticBodyOptions3D {
  isSensor?: boolean; // default: false
  layer?: number;
  mask?: number;
  materialPreset?: Physics3DMaterialPreset; // default: 'default'
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

| Member      | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `bodyId`    | Opaque numeric body id assigned by the physics engine             |
| `active`    | `true` when the body is registered in the simulation              |
| `enable()`  | Re-create the body (no-op when already active)                    |
| `disable()` | Remove the body from the simulation (no-op when already inactive) |

---

## `useDynamicBody`

```typescript
function useDynamicBody(options?: DynamicBodyOptions3D): DynamicBodyHandle3D;
```

Registers the current actor entity as a fully simulated 3D physics body.

**Parameters**

| Name      | Type                   | Description                                         |
| --------- | ---------------------- | --------------------------------------------------- |
| `options` | `DynamicBodyOptions3D` | Mass, damping, CCD, initial state, and layer config |

**Returns** — `DynamicBodyHandle3D`

### `DynamicBodyOptions3D`

```typescript
interface DynamicBodyOptions3D {
  mass?: number; // default: 1 (kg)
  gravityScale?: number; // default: 1
  linearDamping?: number; // default: 0
  angularDamping?: number; // default: 0
  ccdEnabled?: boolean; // default: false
  isSensor?: boolean; // default: false
  layer?: number;
  mask?: number;
  materialPreset?: Physics3DMaterialPreset; // default: 'default'
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

| Member                     | Unit  | Description                                           |
| -------------------------- | ----- | ----------------------------------------------------- |
| `applyForce(fx, fy, fz)`   | N     | Apply continuous force (mapped to impulse internally) |
| `applyImpulse(ix, iy, iz)` | N·s   | Apply instantaneous linear impulse                    |
| `applyTorque(tx, ty, tz)`  | N·m   | Apply continuous torque                               |
| `setVelocity(vx, vy, vz)`  | m/s   | Set linear velocity directly                          |
| `velocity`                 | m/s   | Current linear velocity (zero vector when inactive)   |
| `angularVelocity`          | rad/s | Current angular velocity (zero vector when inactive)  |

---

## `useBoxCollider`

```typescript
function useBoxCollider(options: BoxColliderOptions3D): BoxColliderHandle3D;
```

Attaches a box-shaped collider to the current entity.

### `BoxColliderOptions3D`

```typescript
interface BoxColliderOptions3D {
  w: number; // full width (half-extent = w/2)
  h: number; // full height
  d?: number; // full depth (default: w)
  offsetX?: number; // local-space X offset
  offsetY?: number; // local-space Y offset
  offsetZ?: number; // local-space Z offset
  isSensor?: boolean; // default: false
  layer?: number;
  mask?: number;
  material?: Physics3DMaterialPreset; // default: 'default'
}
```

**Returns** — `BoxColliderHandle3D` (alias for `ColliderHandle3D`)

---

## `useSphereCollider`

```typescript
function useSphereCollider(options: SphereColliderOptions3D): SphereColliderHandle3D;
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
function useCapsuleCollider(options: CapsuleColliderOptions3D): CapsuleColliderHandle3D;
```

### `CapsuleColliderOptions3D`

```typescript
interface CapsuleColliderOptions3D {
  radius: number;
  height: number; // cylinder height (not including end-caps)
  axis?: 'x' | 'y' | 'z'; // default: 'y'
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

## `useMeshCollider`

```typescript
function useMeshCollider(
  options: MeshColliderOptions | PreloadedBvhHandle,
): MeshColliderHandle3D;
```

### `MeshColliderOptions`

```typescript
interface MeshColliderOptions {
  /** Flat vertex positions [x0,y0,z0, x1,y1,z1, ...]. Required unless __bvhUrl is set. */
  vertices?: Float32Array;
  /** Flat triangle indices [a0,b0,c0, ...]. Required unless __bvhUrl is set. */
  indices?: Uint32Array;
  /** URL to pre-baked BVH binary asset. Set automatically by Vite plugin — do not write manually. */
  __bvhUrl?: string;
  /** Fallback box collider active while BVH loads asynchronously. */
  placeholder?: { halfX: number; halfY: number; halfZ: number };
  /** Set false to force synchronous BVH construction. @default true */
  prebake?: boolean;
  isSensor?: boolean;
  layer?: number;
  mask?: number;
  offsetX?: number; // @default 0
  offsetY?: number; // @default 0
  offsetZ?: number; // @default 0
}
```

**Construction paths:**

| Condition | Path | Thread |
| --- | --- | --- |
| String literal arg `'./file.glb'` | Vite rewrites to `__bvhUrl` at build time | Async fetch at runtime |
| `vertices` + `indices`, ≥ 500 triangles | Off-thread BVH build via Web Worker | Worker |
| `vertices` + `indices`, < 500 triangles | Synchronous BVH construction | Main |
| `PreloadedBvhHandle` | BVH already in memory from `preloadMeshCollider` | Sync if ready |

### `MeshColliderHandle3D`

```typescript
interface MeshColliderHandle3D extends ColliderHandle3D {
  readonly status: 'loading' | 'active' | 'error';
  readonly ready: Promise<void>;
  abort(): void;
  rebuild(vertices: Float32Array, indices: Uint32Array): Promise<void>;
}
```

| Member    | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| `status`  | `'loading'` during async BVH fetch; `'active'` once live; `'error'` on fail  |
| `ready`   | Resolves when collider is active in Rapier. Already resolved for sync path    |
| `abort()` | Cancel a pending async load. No-op if already complete                        |
| `rebuild()` | Replace geometry off-thread (RFC-06c). Sets `status = 'loading'` then `'active'` on completion |

**Constraints:**

- `vertices.length` must be a multiple of 3
- `indices.length` must be a multiple of 3
- Best suited for static bodies only

---

## `preloadMeshCollider`

```typescript
function preloadMeshCollider(url: string): PreloadedBvhHandle;
```

Start fetching a pre-baked BVH binary before the actor that needs it is created. Pass the returned handle directly to `useMeshCollider()` — if the binary is already in memory the collider creation is effectively synchronous.

### `PreloadedBvhHandle`

```typescript
interface PreloadedBvhHandle {
  status: 'loading' | 'ready' | 'error';
  url: string;
  ready: Promise<void>;
}
```

**Example**

```typescript
import { preloadMeshCollider, useMeshCollider } from '@gwenjs/physics3d';

// Kick off fetch at scene load
const zone2Bvh = preloadMeshCollider('/assets/bvh-zone2.bin');

// Later — instant if already downloaded
const Zone2Terrain = defineActor(Zone2Prefab, () => {
  useStaticBody();
  useMeshCollider(zone2Bvh);
});
```

---

## `useConvexCollider`

```typescript
function useConvexCollider(options: ConvexColliderOptions): ConvexColliderHandle3D;
```

### `ConvexColliderOptions`

```typescript
interface ConvexColliderOptions {
  vertices: Float32Array; // [x0, y0, z0, x1, y1, z1, ...]
  isSensor?: boolean;
  layer?: number;
  mask?: number;
  material?: Physics3DMaterialPreset;
}
```

The Rapier3D engine automatically computes the convex hull from the vertex point cloud.

---

## `useHeightfieldCollider`

```typescript
function useHeightfieldCollider(options: HeightfieldColliderOptions): HeightfieldColliderHandle3D;
```

### `HeightfieldColliderOptions`

```typescript
interface HeightfieldColliderOptions {
  /** Row-major flat array of rows × cols height values. Index [r * cols + c] = height at (r, c). */
  heights: Float32Array;
  /** Number of rows (Z axis). Must be ≥ 2. */
  rows: number;
  /** Number of columns (X axis). Must be ≥ 2. */
  cols: number;
  /** World-space width in metres. @default 1 */
  scaleX?: number;
  /** World-space height multiplier in metres. @default 1 */
  scaleY?: number;
  /** World-space depth in metres. @default 1 */
  scaleZ?: number;
  /** Surface friction coefficient (≥ 0). @default 0.5 */
  friction?: number;
  /** Bounciness [0, 1]. @default 0 */
  restitution?: number;
  /** Collision layer bitmask (membership). */
  layer?: number;
  /** Collision filter bitmask (which layers to collide with). */
  mask?: number;
  /** Built-in material preset. @default 'default' */
  material?: Physics3DMaterialPreset;
}
```

### `HeightfieldColliderHandle3D`

```typescript
interface HeightfieldColliderHandle3D extends ColliderHandle3D {
  /**
   * Replace height data in-place. Grid dimensions and scale are reused from construction.
   * newHeights.length must equal rows × cols.
   */
  update(newHeights: Float32Array): void;
}
```

**Memory cost:** `rows × cols × 4` bytes (no BVH tree overhead).
**Construction time:** ~5 ms for a 64×64 grid vs ~200 ms for an equivalent trimesh BVH.

---

## `useCompoundCollider`

```typescript
function useCompoundCollider(options: CompoundColliderOptions3D): CompoundColliderHandle3D;
```

All shapes are sent to the WASM bridge in a single `physics3d_add_compound_collider` call.

### `CompoundShapeSpec`

```typescript
type CompoundShapeSpec =
  | {
      type: 'box';
      halfX: number; halfY: number; halfZ: number;
      offsetX?: number; offsetY?: number; offsetZ?: number;
      isSensor?: boolean; friction?: number; restitution?: number;
    }
  | {
      type: 'sphere';
      radius: number;
      offsetX?: number; offsetY?: number; offsetZ?: number;
      isSensor?: boolean; friction?: number; restitution?: number;
    }
  | {
      type: 'capsule';
      radius: number; halfHeight: number;
      offsetX?: number; offsetY?: number; offsetZ?: number;
      isSensor?: boolean; friction?: number; restitution?: number;
    };
```

All offsets are in **local body space** (metres). `friction` defaults to `0.5`; `restitution` defaults to `0.0`.

### `CompoundColliderOptions3D`

```typescript
interface CompoundColliderOptions3D {
  /** Ordered list of primitive shapes. At least one shape required. */
  shapes: CompoundShapeSpec[];
  /** Named collision layers shared across all shapes (resolved to bitmask). */
  layers?: string[];
  /** Named layers these shapes collide with. */
  mask?: string[];
}
```

### `CompoundColliderHandle3D`

```typescript
interface CompoundColliderHandle3D {
  /** Stable numeric IDs for each shape, in options.shapes order. */
  readonly colliderIds: readonly number[];
  /** Detach all shapes from the entity at once. */
  remove(): void;
}
```

---

## `useBulkStaticBoxes`

```typescript
function useBulkStaticBoxes(options: BulkStaticBoxesOptions): BulkStaticBoxesResult;
```

Spawn N static box bodies in one WASM round-trip. Equivalent to calling `useStaticBody()` + `useBoxCollider()` N times, but with a single Rust call in the backend.

### `BulkStaticBoxesOptions`

```typescript
interface BulkStaticBoxesOptions {
  /** Flat position buffer [x0,y0,z0, x1,y1,z1, ...]. Length must be a multiple of 3. N = length / 3. */
  positions: Float32Array;
  /** Either 3 floats (uniform for all N boxes) or N × 3 floats (per-box half-extents). */
  halfExtents: Float32Array;
  /** Surface friction coefficient (≥ 0). @default 0.5 */
  friction?: number;
  /** Bounciness coefficient [0, 1]. @default 0 */
  restitution?: number;
  /** Named collision layers each box belongs to. Resolved to bitmask. */
  layers?: string[];
  /** Named layers each box collides with. Resolved to bitmask. */
  mask?: string[];
}
```

### `BulkStaticBoxesResult`

```typescript
interface BulkStaticBoxesResult {
  /** Packed EntityIds for all created bodies, in spawn order. */
  entityIds: EntityId[];
  /** Boxes actually created. May be less than N on partial failure. */
  count: number;
}
```

---

## `ColliderHandle3D`

All collider composables return a value that implements this interface:

```typescript
interface ColliderHandle3D {
  readonly colliderId: number; // Stable numeric id
  remove(): void; // Remove from entity
}
```

Named aliases for each collider type:

```typescript
type BoxColliderHandle3D = ColliderHandle3D;
type SphereColliderHandle3D = ColliderHandle3D;
type CapsuleColliderHandle3D = ColliderHandle3D;
type ConvexColliderHandle3D = ColliderHandle3D;
// MeshColliderHandle3D and HeightfieldColliderHandle3D extend ColliderHandle3D with extra members.
// CompoundColliderHandle3D has colliderIds[] instead of a single colliderId.
```

---

## `defineLayers`

```typescript
function defineLayers<T extends Record<string, number>>(definition: T): { [K in keyof T]: number };
```

Defines named collision layer bitmasks. Emits `console.warn` when any two values share bits.

**Example**

```typescript
const Layers = defineLayers({
  player: 1,
  enemy: 2,
  ground: 4,
  trigger: 8,
});
// Layers.player === 1, Layers.ground === 4, etc.
```

**Vite plugin inlining:** When the `gwen:physics3d` Vite plugin is active (registered automatically by `physics3dModule`), all `Layers.xxx` references are replaced with numeric literals at build time, enabling dead-code elimination.

---

## `onContact`

```typescript
function onContact(callback: (contact: ContactEvent3D) => void): void;
```

Register a per-frame callback for 3D contact events.

### `ContactEvent3D`

```typescript
interface ContactEvent3D {
  entityA: bigint; // Packed slot index of the first body
  entityB: bigint; // Packed slot index of the second body
  contactX: number; // World-space contact point X (metres)
  contactY: number; // World-space contact point Y
  contactZ: number; // World-space contact point Z (3D only)
  normalX: number; // Contact normal X (unit vector B → A)
  normalY: number; // Contact normal Y
  normalZ: number; // Contact normal Z (3D only)
  relativeVelocity: number; // Impact velocity magnitude (m/s)
  restitution: number; // Effective restitution coefficient
}
```

Events are delivered from a `SharedArrayBuffer` ring buffer with 512-slot capacity. For scenes with very high collision rates, filter on `relativeVelocity` before triggering expensive gameplay logic.

---

## `onSensorEnter`

```typescript
function onSensorEnter(sensorId: number, callback: (entityId: bigint) => void): void;
```

Register a callback invoked when an entity enters a sensor zone. `sensorId` is the `colliderId` returned by a collider composable.

---

## `onSensorExit`

```typescript
function onSensorExit(sensorId: number, callback: (entityId: bigint) => void): void;
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
const CONTACT_EVENT_FLOATS: 10; // f32 slots per event record
const RING_CAPACITY_3D: 512; // maximum events in the buffer
```

**Memory layout per slot** (40 bytes):

| Index | View           | Description        |
| ----- | -------------- | ------------------ |
| 0     | `Uint32Array`  | entityA slot index |
| 1     | `Uint32Array`  | entityB slot index |
| 2     | `Float32Array` | contactX           |
| 3     | `Float32Array` | contactY           |
| 4     | `Float32Array` | contactZ           |
| 5     | `Float32Array` | normalX            |
| 6     | `Float32Array` | normalY            |
| 7     | `Float32Array` | normalZ            |
| 8     | `Float32Array` | relativeVelocity   |
| 9     | `Float32Array` | restitution        |

---

## `physics3dVitePlugin` / `createGwenPhysics3DPlugin`

```typescript
function physics3dVitePlugin(options?: Physics3DVitePluginOptions): Plugin;
function createGwenPhysics3DPlugin(options?: Physics3DVitePluginOptions): Plugin;
```

`createGwenPhysics3DPlugin` is the preferred factory since v2; `physics3dVitePlugin` is kept for backward compatibility. Both return the same Vite plugin.

Automatically registered by `physics3dModule`. Can also be added manually:

```typescript
// vite.config.ts
import { createGwenPhysics3DPlugin } from '@gwenjs/physics3d';

export default {
  plugins: [createGwenPhysics3DPlugin({ debug: true })],
};
```

### `Physics3DVitePluginOptions`

```typescript
interface Physics3DVitePluginOptions {
  debug?: boolean; // Log inlining and BVH baking activity. default: false
}
```

**Current transformations:**

- `defineLayers` constant inlining — replaces `Layers.xxx` references with numeric literals for dead-code elimination.
- **BVH pre-baking (RFC-06c)** — detects `useMeshCollider('./path/to/file.glb')` string-literal calls at compile time. For each detected call:
  1. Parses geometry from the GLB using the GWEN mesh extractor.
  2. Builds the Rapier3D BVH off the main build thread.
  3. Emits a `bvh-<hash>.bin` binary asset into the Vite output.
  4. Rewrites the `useMeshCollider` call argument to `{ __bvhUrl: '/assets/bvh-<hash>.bin' }`.

  At runtime the `.bin` asset is fetched asynchronously; `MeshColliderHandle3D.status` transitions from `'loading'` to `'active'` once the fetch completes.

**Example transform (build input → output):**

```typescript
// Before (source code)
useMeshCollider('./terrain.glb');

// After (Vite rewrites to)
useMeshCollider({ __bvhUrl: '/assets/bvh-a1b2c3d4.bin' });
```

---

## Internal / Test Utilities

These are exported for testing and plugin teardown. Not intended for direct use in game code:

| Export                                      | Description                                              |
| ------------------------------------------- | -------------------------------------------------------- |
| `_dispatchContactEvent(event)`              | Dispatch to all `onContact` callbacks                    |
| `_clearContactCallbacks()`                  | Remove all `onContact` callbacks                         |
| `_dispatchSensorEnter(sensorId, entityId)`  | Dispatch to matching `onSensorEnter` callbacks           |
| `_dispatchSensorExit(sensorId, entityId)`   | Dispatch to matching `onSensorExit` callbacks            |
| `_clearSensorCallbacks()`                   | Remove all sensor callbacks                              |
| `extractLayerDefinitions(code)`             | Parse `defineLayers(...)` from source (Vite plugin util) |
| `inlineLayerReferences(code, varName, map)` | Replace layer references with literals                   |
