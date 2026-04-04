# Physics 3D Composables

**Package:** `@gwenjs/physics3d` — RFC-06 DX Composables

This guide covers the RFC-06 composable API for `@gwenjs/physics3d`. These composables provide an ergonomic, actor-centric way to work with 3D physics without manually calling the lower-level `Physics3DAPI` service methods.

---

## Overview

RFC-06 adds a set of composable functions that mirror the developer experience of popular 3D frameworks:

| Composable             | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `useStaticBody()`      | Non-moving body (walls, terrain, obstacles)    |
| `useDynamicBody()`     | Fully simulated body (characters, projectiles) |
| `useBoxCollider()`     | Axis-aligned box collision shape               |
| `useSphereCollider()`  | Sphere collision shape                         |
| `useCapsuleCollider()` | Capsule collision shape (great for characters) |
| `useMeshCollider()`          | Triangle mesh shape with BVH pre-baking and async loading (3D only) |
| `useConvexCollider()`        | Convex hull shape (3D only)                                         |
| `useHeightfieldCollider()`   | Grid-based terrain collision (40× more memory-efficient than trimesh) |
| `useCompoundCollider()`      | Multiple primitive shapes on one rigid body (125× faster than trimesh for dynamic bodies) |
| `useBulkStaticBoxes()`       | Spawn hundreds of static box obstacles in one WASM call             |
| `defineLayers()`             | Named collision layer bitmask definitions                           |
| `onContact()`          | Per-frame contact event callbacks              |
| `onSensorEnter()`      | Sensor zone entry callbacks                    |
| `onSensorExit()`       | Sensor zone exit callbacks                     |

All composables are automatically imported when you add the `@gwenjs/physics3d` module to your GWEN config.

---

## `useStaticBody`

Register the current actor's entity as a **fixed, non-moving** physics body. Static bodies participate in collision detection but are never displaced by the simulation.

### Signature

```typescript
function useStaticBody(options?: StaticBodyOptions3D): StaticBodyHandle3D;
```

### Options

| Option           | Type                      | Default     | Description                                     |
| ---------------- | ------------------------- | ----------- | ----------------------------------------------- |
| `isSensor`       | `boolean`                 | `false`     | Generates events but no physical response       |
| `layer`          | `number`                  | —           | Collision layer bitmask (membership)            |
| `mask`           | `number`                  | —           | Collision filter bitmask (what to collide with) |
| `materialPreset` | `Physics3DMaterialPreset` | `'default'` | Built-in material                               |

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
  useStaticBody();
  useBoxCollider({ w: 2, h: 4, d: 0.5 });
});
```

### Example — Toggle on/off at runtime

```typescript
const DoorActor = defineActor(DoorPrefab, () => {
  const body = useStaticBody();
  useBoxCollider({ w: 1.5, h: 3, d: 0.2 });

  onEvent('door:open', () => body.disable());
  onEvent('door:close', () => body.enable());
});
```

---

## `useDynamicBody`

Register the current actor's entity as a **fully simulated** dynamic physics body. Dynamic bodies respond to gravity, forces, impulses, and collisions.

### Signature

```typescript
function useDynamicBody(options?: DynamicBodyOptions3D): DynamicBodyHandle3D;
```

### Options

| Option                   | Type                     | Default | Description                                       |
| ------------------------ | ------------------------ | ------- | ------------------------------------------------- |
| `mass`                   | `number`                 | `1`     | Body mass in kg. Values ≤ 0 are clamped to 0.0001 |
| `gravityScale`           | `number`                 | `1`     | Gravity multiplier. `0` = no gravity              |
| `linearDamping`          | `number`                 | `0`     | Linear velocity damping coefficient               |
| `angularDamping`         | `number`                 | `0`     | Angular velocity damping coefficient              |
| `ccdEnabled`             | `boolean`                | `false` | Enable CCD for fast-moving bodies                 |
| `isSensor`               | `boolean`                | `false` | Generates events but no physical response         |
| `initialPosition`        | `Partial<Physics3DVec3>` | —       | Initial position in metres                        |
| `initialRotation`        | `Partial<Physics3DQuat>` | —       | Initial orientation (unit quaternion)             |
| `initialLinearVelocity`  | `Partial<Physics3DVec3>` | —       | Initial velocity in m/s                           |
| `initialAngularVelocity` | `Partial<Physics3DVec3>` | —       | Initial angular velocity in rad/s                 |

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
  const body = useDynamicBody({ mass: 2, ccdEnabled: true });
  useSphereCollider({ radius: 0.5, material: 'rubber' });

  // Launch upward at spawn
  body.applyImpulse(0, 15, 0);
});
```

### Example — Character controller

```typescript
const PlayerActor = defineActor(PlayerPrefab, () => {
  const body = useDynamicBody({
    mass: 80,
    linearDamping: 0.3,
    gravityScale: 1,
    ccdEnabled: true,
  });
  useCapsuleCollider({ radius: 0.4, height: 1.8 });

  onStep(() => {
    const vel = body.velocity;
    if (input.isHeld('jump') && Math.abs(vel.y) < 0.1) {
      body.applyImpulse(0, 600, 0);
    }
  });
});
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
function useBoxCollider(options: BoxColliderOptions3D): BoxColliderHandle3D;
```

| Option        | Type                      | Default     | Description                                             |
| ------------- | ------------------------- | ----------- | ------------------------------------------------------- |
| `w`           | `number`                  | —           | Full width (half-extent = w/2)                          |
| `h`           | `number`                  | —           | Full height                                             |
| `d`           | `number`                  | `w`         | Full depth (defaults to `w` for a square cross-section) |
| `offsetX/Y/Z` | `number`                  | `0`         | Local-space offset                                      |
| `isSensor`    | `boolean`                 | `false`     | —                                                       |
| `material`    | `Physics3DMaterialPreset` | `'default'` | —                                                       |

```typescript
useBoxCollider({ w: 10, h: 1, d: 4 }); // 10×1×4 platform
```

### `useSphereCollider`

```typescript
function useSphereCollider(options: SphereColliderOptions3D): SphereColliderHandle3D;
```

```typescript
useSphereCollider({ radius: 0.5 });
```

### `useCapsuleCollider`

```typescript
function useCapsuleCollider(options: CapsuleColliderOptions3D): CapsuleColliderHandle3D;
```

| Option   | Type                | Default | Description                              |
| -------- | ------------------- | ------- | ---------------------------------------- |
| `radius` | `number`            | —       | Capsule radius                           |
| `height` | `number`            | —       | Cylinder height (not including end-caps) |
| `axis`   | `'x' \| 'y' \| 'z'` | `'y'`   | Primary axis                             |

```typescript
useCapsuleCollider({ radius: 0.4, height: 1.8 }); // character shape
```

### `useMeshCollider` — trimesh & BVH

A trimesh collider uses exact triangle geometry for concave static objects such as terrain. Supports three construction paths depending on mesh size and whether a Vite build step is available.

```typescript
function useMeshCollider(
  options: MeshColliderOptions | PreloadedBvhHandle,
): MeshColliderHandle3D;
```

**Basic options:**

| Option       | Type           | Default | Description                                        |
| ------------ | -------------- | ------- | -------------------------------------------------- |
| `vertices`   | `Float32Array` | —       | Flat `[x,y,z, ...]` vertex array                   |
| `indices`    | `Uint32Array`  | —       | Triangle indices `[a,b,c, ...]`                    |
| `isSensor`   | `boolean`      | `false` | Generate events only, no physical response         |
| `layer`      | `number`       | —       | Collision layer bitmask (membership)               |
| `mask`       | `number`       | —       | Collision filter bitmask                           |
| `offsetX/Y/Z`| `number`       | `0`     | Local-space offset from the body origin            |
| `placeholder`| `{ halfX, halfY, halfZ }` | — | Temporary box collider active while BVH loads |
| `prebake`    | `boolean`      | `true`  | Set `false` to force synchronous runtime BVH       |
| `__bvhUrl`   | `string`       | —       | Pre-baked BVH URL — set by Vite plugin, not manually |

> **Performance tip:** Use mesh colliders only on static bodies. Dynamic bodies with mesh colliders are expensive in the Rapier3D solver. Prefer `useConvexCollider` or [`useCompoundCollider`](#usecompoundcollider) for dynamic geometry.

#### BVH Pre-baking (RFC-06c)

The `gwen:physics3d` Vite plugin provides three BVH construction paths automatically selected based on how you call `useMeshCollider`:

**Path 1 — Static GLB (Vite build-time, recommended for static terrain)**

Pass a string literal with a `.glb` path. The Vite plugin detects this at compile time, pre-bakes the BVH into a `.bin` asset, and rewrites the call to use `__bvhUrl`. At runtime the binary is fetched asynchronously — `status` starts as `'loading'` and becomes `'active'` when ready.

```typescript
const TerrainActor = defineActor(TerrainPrefab, () => {
  useStaticBody();
  const mesh = useMeshCollider('./terrain.glb');

  // Optional: wait for collider to become live
  mesh.ready.then(() => console.log('terrain collider active'));
});
```

**Path 2 — Async procedural (Web Worker, ≥ 500 triangles)**

Pass `vertices` + `indices` with a large mesh. GWEN sends BVH construction to a Web Worker off the main thread. `status` is `'loading'` until the worker returns, then `'active'`.

```typescript
const TerrainActor = defineActor(TerrainPrefab, () => {
  useStaticBody();
  const mesh = useMeshCollider({
    vertices: generatedVerts,   // Float32Array — built at runtime
    indices:  generatedIndices, // Uint32Array
    placeholder: { halfX: 50, halfY: 2, halfZ: 50 }, // box while BVH loads
  });

  mesh.ready.then(() => console.log(`status: ${mesh.status}`)); // 'active'
});
```

**Path 3 — Sync fallback (< 500 triangles)**

Small meshes are constructed synchronously with no Worker overhead. `status` is `'active'` immediately.

```typescript
useStaticBody();
useMeshCollider({ vertices: smallMeshVerts, indices: smallMeshIndices });
// status is 'active' right away
```

#### `MeshColliderHandle3D`

```typescript
interface MeshColliderHandle3D extends ColliderHandle3D {
  readonly status: 'loading' | 'active' | 'error';
  readonly ready: Promise<void>;
  abort(): void;
  rebuild(vertices: Float32Array, indices: Uint32Array): Promise<void>;
}
```

| Member      | Description                                                                    |
| ----------- | ------------------------------------------------------------------------------ |
| `status`    | Current load state — `'active'` once live in Rapier                            |
| `ready`     | Resolves when collider becomes active; already resolved for sync construction  |
| `abort()`   | Cancel a pending async BVH load (no-op if already complete)                   |
| `rebuild()` | Replace geometry with new vertex/index data; builds BVH off-thread (RFC-06c)  |

#### `preloadMeshCollider`

Warm the BVH cache before the actor is created — useful for open-world streaming.

```typescript
function preloadMeshCollider(url: string): PreloadedBvhHandle;
```

```typescript
// At scene load — start fetching immediately
const zone2Bvh = preloadMeshCollider('/assets/bvh-zone2.bin');

// Later, when the player approaches Zone 2
const Zone2Terrain = defineActor(Zone2Prefab, () => {
  useStaticBody();
  useMeshCollider(zone2Bvh); // effectively synchronous if already loaded
});
```

`PreloadedBvhHandle` fields: `status: 'loading' | 'ready' | 'error'`, `url: string`, `ready: Promise<void>`.

---

### `useConvexCollider` — convex hull

A convex hull collider automatically computes the smallest convex shape that contains a point cloud. Suitable for dynamic bodies when primitives are not a close enough approximation.

```typescript
function useConvexCollider(options: ConvexColliderOptions): ConvexColliderHandle3D;
```

| Option     | Type                      | Description                     |
| ---------- | ------------------------- | ------------------------------- |
| `vertices` | `Float32Array`            | Flat `[x,y,z, ...]` point cloud |
| `isSensor` | `boolean`                 | —                               |
| `material` | `Physics3DMaterialPreset` | —                               |

```typescript
useDynamicBody({ mass: 50 });
useConvexCollider({ vertices: crateHullPoints });
```

---

## `useHeightfieldCollider`

A heightfield collider stores terrain as a regular `rows × cols` grid of height values. Compared to a trimesh (BVH ~4 MB, construction ~200 ms), a heightfield uses only `rows × cols × 4` bytes and builds in ~5 ms — roughly **40× more memory-efficient** for regular terrain grids.

**When to use:** Open-world terrain, RTS maps, racing tracks, procedural landscapes. Use `useMeshCollider` only when the terrain is genuinely irregular (e.g., imported from an arbitrary GLB).

### Signature

```typescript
function useHeightfieldCollider(options: HeightfieldColliderOptions): HeightfieldColliderHandle3D;
```

Must be called after `useStaticBody()`.

### Options

| Option        | Type                      | Default     | Description                                                  |
| ------------- | ------------------------- | ----------- | ------------------------------------------------------------ |
| `heights`     | `Float32Array`            | —           | Row-major flat array of `rows × cols` height values. Index `[r * cols + c]` = height at row `r`, column `c` |
| `rows`        | `number`                  | —           | Number of rows along the Z axis. Must be ≥ 2                |
| `cols`        | `number`                  | —           | Number of columns along the X axis. Must be ≥ 2             |
| `scaleX`      | `number`                  | `1`         | World-space width of the entire heightfield in metres        |
| `scaleY`      | `number`                  | `1`         | World-space height multiplier in metres                      |
| `scaleZ`      | `number`                  | `1`         | World-space depth of the entire heightfield in metres        |
| `friction`    | `number`                  | `0.5`       | Surface friction coefficient (≥ 0)                          |
| `restitution` | `number`                  | `0`         | Bounciness [0, 1]                                            |
| `layer`       | `number`                  | —           | Collision layer bitmask (membership)                         |
| `mask`        | `number`                  | —           | Collision filter bitmask                                     |
| `material`    | `Physics3DMaterialPreset` | `'default'` | Built-in material preset (overrides friction/restitution)    |

### `HeightfieldColliderHandle3D`

```typescript
interface HeightfieldColliderHandle3D extends ColliderHandle3D {
  update(newHeights: Float32Array): void;
}
```

`update()` rebuilds the heightfield in-place using the same grid dimensions and scale. The new array must have exactly `rows × cols` values. Use this for deformable terrain (crater blasts, rising water).

### Example — Terrain generation and deformation

```typescript
import { defineActor, onUpdate } from '@gwenjs/core';
import { useStaticBody, useHeightfieldCollider } from '@gwenjs/physics3d';

const ROWS = 64;
const COLS = 64;

// Generate Perlin-noise heights (example helper)
const heights = generateHeightmap(ROWS, COLS);

const TerrainActor = defineActor(TerrainPrefab, () => {
  useStaticBody();
  const terrain = useHeightfieldCollider({
    heights,
    rows: ROWS,
    cols: COLS,
    scaleX: 128, // 128 m wide
    scaleY: 20,  // 20 m max height
    scaleZ: 128, // 128 m deep
    friction: 0.8,
  });

  // Deform on explosion impact
  onEvent('explosion', ({ x, z, radius }) => {
    createCrater(heights, ROWS, COLS, x, z, radius);
    terrain.update(heights);
  });
});
```

---

## `useCompoundCollider`

A compound collider attaches multiple primitive shapes (box, sphere, capsule) to one rigid body in a **single WASM round-trip** via `physics3d_add_compound_collider`.

**Why compound instead of trimesh on a dynamic body?** Rapier3D runs narrowphase tests on every `(body, collider)` pair per frame. A trimesh with 1 000 triangles costs O(1 000) tests per contact. Eight compound primitives cost O(8) — roughly **125× faster** at equivalent visual fidelity.

> ⚠️ **Never use trimesh colliders on dynamic rigid bodies.** They are only stable on static/fixed bodies. For cars, robots, and characters always use `useCompoundCollider`.

### Signature

```typescript
function useCompoundCollider(options: CompoundColliderOptions3D): CompoundColliderHandle3D;
```

Must be called after `useStaticBody()` or `useDynamicBody()`.

### `CompoundShapeSpec`

Each entry in `options.shapes` is one of three discriminated union variants:

```typescript
type CompoundShapeSpec =
  | { type: 'box';     halfX: number; halfY: number; halfZ: number;
      offsetX?: number; offsetY?: number; offsetZ?: number;
      isSensor?: boolean; friction?: number; restitution?: number; }
  | { type: 'sphere';  radius: number;
      offsetX?: number; offsetY?: number; offsetZ?: number;
      isSensor?: boolean; friction?: number; restitution?: number; }
  | { type: 'capsule'; radius: number; halfHeight: number;
      offsetX?: number; offsetY?: number; offsetZ?: number;
      isSensor?: boolean; friction?: number; restitution?: number; };
```

All offsets are in **local body space** (metres). `friction` defaults to `0.5`; `restitution` defaults to `0.0`.

### Options

| Option   | Type                | Default | Description                                               |
| -------- | ------------------- | ------- | --------------------------------------------------------- |
| `shapes` | `CompoundShapeSpec[]` | —     | Ordered list of primitive shapes. At least one required  |
| `layers` | `string[]`          | —       | Named collision layers (shared across all shapes)        |
| `mask`   | `string[]`          | —       | Named layers these shapes collide with                   |

### `CompoundColliderHandle3D`

```typescript
interface CompoundColliderHandle3D {
  readonly colliderIds: readonly number[];
  remove(): void;
}
```

`colliderIds` holds one stable ID per shape in `options.shapes` order. `remove()` detaches all shapes at once.

### Example — Car body with wheel spheres

```typescript
import { defineActor } from '@gwenjs/core';
import { useDynamicBody, useCompoundCollider } from '@gwenjs/physics3d';

const CarActor = defineActor(CarPrefab, () => {
  useDynamicBody({ mass: 1200, linearDamping: 0.1 });

  const compound = useCompoundCollider({
    shapes: [
      // Chassis
      { type: 'box', halfX: 1.0, halfY: 0.3, halfZ: 2.0, offsetY: 0.3 },
      // Front-left wheel
      { type: 'sphere', radius: 0.35, offsetX: -0.9, offsetZ:  1.6 },
      // Front-right wheel
      { type: 'sphere', radius: 0.35, offsetX:  0.9, offsetZ:  1.6 },
      // Rear-left wheel
      { type: 'sphere', radius: 0.35, offsetX: -0.9, offsetZ: -1.6 },
      // Rear-right wheel
      { type: 'sphere', radius: 0.35, offsetX:  0.9, offsetZ: -1.6 },
    ],
  });

  // compound.colliderIds → [chassisId, wFL, wFR, wRL, wRR]
});
```

---

## `useBulkStaticBoxes`

Spawn N static rigid bodies with box colliders in **one WASM round-trip**. This is significantly faster than looping `useStaticBody()` + `useBoxCollider()` when placing large amounts of static geometry at scene load.

**When to use:** Hundreds of maze walls, platform tiles, level decorations. For fewer than ~10 boxes, individual composables are fine. For 10–10 000 boxes, use `useBulkStaticBoxes`.

### Signature

```typescript
function useBulkStaticBoxes(options: BulkStaticBoxesOptions): BulkStaticBoxesResult;
```

Can be called from inside an actor or from a system `setup()` callback.

### Options

| Option        | Type           | Default | Description                                                                                  |
| ------------- | -------------- | ------- | -------------------------------------------------------------------------------------------- |
| `positions`   | `Float32Array` | —       | Flat position buffer `[x0,y0,z0, x1,y1,z1, ...]`. Length must be a multiple of 3. `N = positions.length / 3` |
| `halfExtents` | `Float32Array` | —       | Either 3 floats (uniform for all N boxes) or `N × 3` floats (per-box half-extents)         |
| `friction`    | `number`       | `0.5`   | Surface friction coefficient (≥ 0)                                                           |
| `restitution` | `number`       | `0`     | Bounciness coefficient [0, 1]                                                                |
| `layers`      | `string[]`     | —       | Named collision layers each box belongs to                                                   |
| `mask`        | `string[]`     | —       | Named layers each box collides with                                                          |

### Result

```typescript
interface BulkStaticBoxesResult {
  entityIds: EntityId[]; // Spawned entity IDs in spawn order
  count: number;         // Boxes actually created (may be < N on failure)
}
```

### Example — Maze wall generation

```typescript
import { defineSystem, onSetup } from '@gwenjs/core';
import { useBulkStaticBoxes } from '@gwenjs/physics3d';

export const MazeSystem = defineSystem(() => {
  onSetup(() => {
    const wallPositions = buildMazeWalls(); // returns Float32Array of [x,y,z, ...]

    const { entityIds, count } = useBulkStaticBoxes({
      positions:   wallPositions,
      halfExtents: new Float32Array([0.5, 1.0, 0.5]), // uniform 1×2×1 m walls
      friction:    0.3,
    });

    console.log(`Spawned ${count} maze walls`, entityIds);
  });
});
```

For per-box sizes, pass a `N × 3` `halfExtents` buffer:

```typescript
// Different size for each box
const halfExtents = new Float32Array([
  0.5, 1.0, 0.5,   // box 0
  2.0, 0.5, 0.5,   // box 1 — wider
  0.5, 2.0, 0.5,   // box 2 — taller
]);
useBulkStaticBoxes({ positions, halfExtents });
```

---

Define named collision layer bitmasks. Each value should be a unique power-of-two so that layers can be combined with bitwise OR.

```typescript
function defineLayers<T extends Record<string, number>>(definition: T): { [K in keyof T]: number };
```

If any two entries share overlapping bits, a `console.warn` is emitted at runtime.

The `gwen:physics3d` Vite plugin inlines these constants at build time, eliminating the `defineLayers` call from the production bundle.

### Example

```typescript
export const Layers = defineLayers({
  player: 0b00001, // 1
  enemy: 0b00010, // 2
  ground: 0b00100, // 4
  trigger: 0b01000, // 8
  bullet: 0b10000, // 16
});

// Use with a dynamic body
useDynamicBody({
  layer: Layers.player,
  mask: Layers.ground | Layers.enemy | Layers.bullet,
});
```

---

## Contact Events

`onContact` registers a callback invoked for every `ContactEvent3D` dispatched in the current frame by the physics plugin.

```typescript
function onContact(callback: (contact: ContactEvent3D) => void): void;
```

### `ContactEvent3D` fields

| Field              | Type     | Description                               |
| ------------------ | -------- | ----------------------------------------- |
| `entityA`          | `bigint` | Packed slot index of the first body       |
| `entityB`          | `bigint` | Packed slot index of the second body      |
| `contactX`         | `number` | World-space contact point X (metres)      |
| `contactY`         | `number` | World-space contact point Y               |
| `contactZ`         | `number` | World-space contact point Z (**3D only**) |
| `normalX`          | `number` | Contact normal X (unit vector B → A)      |
| `normalY`          | `number` | Contact normal Y                          |
| `normalZ`          | `number` | Contact normal Z (**3D only**)            |
| `relativeVelocity` | `number` | Magnitude of impact velocity in m/s       |
| `restitution`      | `number` | Effective restitution coefficient         |

Events are delivered via a `SharedArrayBuffer` ring buffer (`ContactRingBuffer3D`) with 512-slot capacity. For high-collision scenes, consider filtering by `relativeVelocity` to reduce callback overhead.

### Example — Impact sound

```typescript
onContact((contact) => {
  if (contact.relativeVelocity > 3) {
    const vol = Math.min(contact.relativeVelocity / 20, 1);
    audio.playSfx('impact', {
      volume: vol,
      x: contact.contactX,
      y: contact.contactY,
      z: contact.contactZ,
    });
  }
});
```

---

## Sensor Events

`onSensorEnter` and `onSensorExit` register callbacks for when entities enter or exit a sensor zone. Sensors are colliders with `isSensor: true` — they generate events but cause no physical displacement.

```typescript
function onSensorEnter(sensorId: number, callback: (entityId: bigint) => void): void;
function onSensorExit(sensorId: number, callback: (entityId: bigint) => void): void;
```

### Example — Trigger zone

```typescript
const CheckpointActor = defineActor(CheckpointPrefab, () => {
  useStaticBody();
  const zone = useBoxCollider({ w: 4, h: 3, d: 4, isSensor: true });

  onSensorEnter(zone.colliderId, (entityId) => {
    game.triggerCheckpoint(entityId);
  });
});
```
