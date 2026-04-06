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
| `useKinematicBody()`   | Kinematic body driven by explicit velocity writes  |
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
| `useRaycast()`               | Zero-copy SAB raycast slot (result read from SharedArrayBuffer each frame) |
| `useShapeCast()`             | Zero-copy SAB shape-cast slot                                              |
| `useOverlap()`               | Zero-copy SAB overlap slot (max 16 overlapping entities per query)         |
| `useJoint()`                 | Impulse joint between two entities (fixed/revolute/prismatic/ball/spring)  |
| `useCharacterController()`   | Kinematic character controller with ground detection and slope limiting    |
| `initNavGrid3D()`            | Initialise a 3D A\* navigation grid from world bounds                      |
| `findPath3D()`               | Find a path between two world-space points using A\*                       |

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
| `fixedRotation`  | `boolean`                                      | `false`     | Lock all rotational degrees of freedom (ideal for upright characters). |
| `quality`        | `'low' \| 'medium' \| 'high' \| 'esport'`     | `'medium'`  | Per-body solver iteration budget override. Overrides the plugin-level `qualityPreset`. |

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

## `useKinematicBody`

Register the current actor's entity as a **kinematic** 3D physics body. Kinematic bodies
participate in collision detection and push dynamic bodies out of their path, but are
**never displaced by forces or gravity**.

Move via `setVelocity()` (integrated each frame) or `moveTo()` for instant teleports.
Optionally drive orientation via `setAngularVelocity()` (first-order quaternion integration).

### Signature

```typescript
function useKinematicBody(options?: KinematicBodyOptions3D): KinematicBodyHandle3D;
```

### Options

| Option            | Type                                  | Default  | Description                          |
| ----------------- | ------------------------------------- | -------- | ------------------------------------ |
| `initialPosition` | `{ x: number; y: number; z: number }` | —        | Spawn position in metres             |
| `initialRotation` | `{ x, y, z, w }`                     | identity | Spawn orientation as unit quaternion |
| `fixedRotation`   | `boolean`                             | `false`  | Disable angular velocity integration |

### Handle

```typescript
interface KinematicBodyHandle3D {
  readonly bodyId:          number;
  readonly active:          boolean;
  readonly velocity:        { x: number; y: number; z: number };
  readonly angularVelocity: { x: number; y: number; z: number };
  moveTo(x: number, y: number, z: number,
         qx?: number, qy?: number, qz?: number, qw?: number): void;
  setVelocity(vx: number, vy: number, vz: number): void;
  setAngularVelocity(wx: number, wy: number, wz: number): void;
  enable(): void;
  disable(): void;
}
```

### Example — vehicle controller

```typescript
import { defineActor, onUpdate } from '@gwenjs/core'
import { useKinematicBody, useBoxCollider } from '@gwenjs/physics3d'
import { useInput } from '@gwenjs/input'

const SPEED      = 12  // m/s
const TURN_SPEED = 2   // rad/s

export const VehicleActor = defineActor(VehiclePrefab, () => {
  const body = useKinematicBody({ fixedRotation: false })
  useBoxCollider({ w: 2, h: 1, d: 4 })

  const input = useInput()

  onUpdate(() => {
    const dir = input.readAxis2D('Move')
    body.setVelocity(dir.x * SPEED, 0, dir.y * SPEED)
    body.setAngularVelocity(0, -dir.x * TURN_SPEED, 0)
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

---

## `useRaycast`

Register a **zero-copy SAB raycast slot** for the current actor. The slot is evaluated during `physics3d_step`; results are available at the start of the next `onUpdate` via the `result` reactive object — no WASM call in the hot path.

> **Performance:** Use `useRaycast` instead of `physics.castRay()` inside `onUpdate`. Imperative calls cross the WASM boundary once per call per frame; SAB slots are filled in batch during the physics step.

### Signature

```typescript
function useRaycast(options: RaycastOptions3D): RaycastHandle3D;
```

### `RaycastOptions3D`

| Option        | Type               | Default     | Description                                              |
| ------------- | ------------------ | ----------- | -------------------------------------------------------- |
| `origin`      | `Vec3 \| () => Vec3` | required  | World-space ray origin. Pass a getter for dynamic origin. |
| `direction`   | `Vec3 \| () => Vec3` | required  | Ray direction (need not be normalised).                  |
| `maxDistance` | `number`           | `100`       | Maximum ray distance (metres).                           |
| `layer`       | `number`           | `0xFFFFFFFF`| Layer bitmask to include.                                |
| `mask`        | `number`           | `0xFFFFFFFF`| Collision mask.                                          |
| `solid`       | `boolean`          | `true`      | Whether a ray starting inside a collider counts as a hit.|

### `RaycastHandle3D`

| Property             | Type      | Description                                        |
| -------------------- | --------- | -------------------------------------------------- |
| `result.hit`         | `boolean` | True if the ray hit something this frame.          |
| `result.entityId`    | `number`  | Entity index of the hit body (`-1` if no hit).     |
| `result.distance`    | `number`  | Distance to the hit point (metres).                |
| `result.normalX/Y/Z` | `number`  | Hit surface normal in world space.                 |
| `result.pointX/Y/Z`  | `number`  | World-space hit point.                             |
| `unregister()`       | `() => void` | Release the SAB slot (called automatically on actor destroy). |

### Example

```typescript
export const EnemyAI = defineSystem(() => {
  const ray = useRaycast({
    origin: () => transform.position,
    direction: { x: 0, y: -1, z: 0 },
    maxDistance: 2,
    layer: Layers.ground,
  });

  onUpdate(() => {
    if (ray.result.hit) {
      // character is within 2m of the ground
    }
  });
});
```

---

## `useShapeCast`

Register a **zero-copy SAB shape-cast slot**. A shape-cast sweeps a convex shape along a direction and reports the first hit, including time-of-impact (TOI) and contact normal.

### Signature

```typescript
function useShapeCast(options: ShapeCastOptions3D): ShapeCastHandle3D;
```

### `ShapeCastOptions3D`

| Option        | Type                 | Default     | Description                                     |
| ------------- | -------------------- | ----------- | ----------------------------------------------- |
| `origin`      | `Vec3 \| () => Vec3` | required    | Shape-cast start position.                      |
| `rotation`    | `Quat \| () => Quat` | identity    | Shape orientation.                              |
| `direction`   | `Vec3 \| () => Vec3` | required    | Cast direction vector.                          |
| `shape`       | `ShapeDescriptor3D`  | required    | Shape to cast (box, sphere, or capsule).        |
| `maxDistance` | `number`             | `50`        | Maximum sweep distance (metres).                |
| `layer`       | `number`             | `0xFFFFFFFF`| Layer bitmask.                                  |
| `mask`        | `number`             | `0xFFFFFFFF`| Collision mask.                                 |

### `ShapeDescriptor3D`

```typescript
{ type: 'box';    halfExtents: { x: number; y: number; z: number } }
{ type: 'sphere'; radius: number }
{ type: 'capsule'; halfHeight: number; radius: number }
```

### `ShapeCastHandle3D`

| Property             | Type      | Description                                          |
| -------------------- | --------- | ---------------------------------------------------- |
| `result.hit`         | `boolean` | True if the swept shape hit something.               |
| `result.entityId`    | `number`  | Hit entity index.                                    |
| `result.toi`         | `number`  | Time-of-impact (0 = at origin, 1 = at maxDistance).  |
| `result.normalX/Y/Z` | `number`  | Contact normal at TOI.                               |
| `unregister()`       | `() => void` | Release the SAB slot.                             |

### Example

```typescript
const sweep = useShapeCast({
  origin: () => transform.position,
  direction: { x: 0, y: -1, z: 0 },
  shape: { type: 'capsule', halfHeight: 0.8, radius: 0.3 },
  maxDistance: 0.2,
});

onUpdate(() => {
  const isGrounded = sweep.result.hit && sweep.result.toi < 0.15;
});
```

---

## `useOverlap`

Register a **zero-copy SAB overlap slot** that reports all colliders intersecting a query shape each frame. Returns up to `maxResults` entity indices.

### Signature

```typescript
function useOverlap(options: OverlapOptions3D): OverlapHandle3D;
```

### `OverlapOptions3D`

| Option        | Type                 | Default     | Description                                    |
| ------------- | -------------------- | ----------- | ---------------------------------------------- |
| `origin`      | `Vec3 \| () => Vec3` | required    | Query shape centre.                            |
| `rotation`    | `Quat \| () => Quat` | identity    | Shape orientation.                             |
| `shape`       | `ShapeDescriptor3D`  | required    | Query shape (box, sphere, or capsule).         |
| `layer`       | `number`             | `0xFFFFFFFF`| Layer bitmask.                                 |
| `mask`        | `number`             | `0xFFFFFFFF`| Collision mask.                                |
| `maxResults`  | `number`             | `16`        | Maximum overlapping entities to report.        |

### `OverlapHandle3D`

| Property           | Type         | Description                                         |
| ------------------ | ------------ | --------------------------------------------------- |
| `result.count`     | `number`     | Number of overlapping entities this frame.          |
| `result.entities`  | `Int32Array` | Entity indices (first `count` entries are valid).   |
| `unregister()`     | `() => void` | Release the SAB slot.                              |

### Example

```typescript
const aoe = useOverlap({
  origin: () => transform.position,
  shape: { type: 'sphere', radius: 5 },
  layer: Layers.enemy,
  maxResults: 32,
});

onUpdate(() => {
  for (let i = 0; i < aoe.result.count; i++) {
    const enemyId = aoe.result.entities[i]!;
    health.damage(enemyId, 10 * dt);
  }
});
```

---

## `useJoint`

Attach an **impulse joint** between two physics entities. The joint is automatically removed when the actor is destroyed.

### Signature

```typescript
function useJoint(type: JointType3D, options: JointOptions3D): JointHandle3D;
```

### `JointType3D`

`'fixed' | 'revolute' | 'prismatic' | 'ball' | 'spring'`

### `JointOptions3D`

| Option       | Type      | Default    | Description                                                       |
| ------------ | --------- | ---------- | ----------------------------------------------------------------- |
| `entityA`    | `number`  | required   | First body entity index.                                          |
| `entityB`    | `number`  | required   | Second body entity index.                                         |
| `anchorA`    | `Vec3`    | `{0,0,0}`  | Anchor in body A local space.                                     |
| `anchorB`    | `Vec3`    | `{0,0,0}`  | Anchor in body B local space.                                     |
| `axisA`      | `Vec3`    | `{0,1,0}`  | Joint axis in body A local space (revolute/prismatic).            |
| `axisB`      | `Vec3`    | `{0,1,0}`  | Joint axis in body B local space (revolute/prismatic).            |
| `useLimits`  | `boolean` | `false`    | Enable angular/linear limits (revolute/prismatic).                |
| `limitMin`   | `number`  | `0`        | Minimum angle (rad) or displacement (m).                          |
| `limitMax`   | `number`  | `0`        | Maximum angle (rad) or displacement (m).                          |
| `restLength` | `number`  | `1`        | Natural rest length (spring only).                                |
| `stiffness`  | `number`  | `100`      | Spring stiffness (spring only).                                   |
| `damping`    | `number`  | `10`       | Spring damping (spring only).                                     |

### `JointHandle3D`

| Method / Property              | Description                                                      |
| ------------------------------ | ---------------------------------------------------------------- |
| `id`                           | Internal joint ID.                                               |
| `setEnabled(enabled)`          | Enable/disable the joint at runtime.                             |
| `setMotorVelocity(vel, force)` | Drive revolute/prismatic at target velocity.                     |
| `setMotorPosition(target, k, d)`| Drive joint to target angle/displacement.                       |
| `remove()`                     | Destroy the joint early.                                         |

### Examples

```typescript
// Fixed joint — weld two bodies
useJoint('fixed', { entityA: bodyA, entityB: bodyB });

// Revolute joint with motor (door hinge)
const hinge = useJoint('revolute', {
  entityA: doorFrame, entityB: door,
  axisA: { x: 0, y: 1, z: 0 }, axisB: { x: 0, y: 1, z: 0 },
  useLimits: true, limitMin: 0, limitMax: Math.PI * 0.75,
});
hinge.setMotorVelocity(2, 50);

// Spring joint
useJoint('spring', { entityA: anchor, entityB: bob, restLength: 3, stiffness: 80, damping: 5 });
```

---

## `useCharacterController`

Attach a **kinematic character controller** to a capsule-collider body. Results (grounded state, ground normal, ground entity) are written to a `SharedArrayBuffer` slot during `physics3d_step` — reading them in `onUpdate` costs zero WASM calls.

### Signature

```typescript
function useCharacterController(options?: CCOptions3D): CCHandle3D;
```

### `CCOptions3D`

| Option           | Type      | Default  | Description                                                                     |
| ---------------- | --------- | -------- | ------------------------------------------------------------------------------- |
| `stepHeight`     | `number`  | `0.3`    | Maximum stair step height (metres).                                             |
| `slopeLimit`     | `number`  | `0.785`  | Maximum walkable slope (radians). Default ≈ 45°.                               |
| `skinWidth`      | `number`  | `0.01`   | Collision skin width (metres). Prevents jitter.                                 |
| `snapToGround`   | `boolean` | `true`   | Snap to ground if within `stepHeight`.                                          |
| `slideOnSlopes`  | `boolean` | `true`   | Slide along surfaces instead of stopping.                                       |
| `applyImpulses`  | `boolean` | `true`   | Push dynamic bodies the character walks into.                                   |

### `CCHandle3D`

| Property / Method      | Type      | Description                                             |
| ---------------------- | --------- | ------------------------------------------------------- |
| `move(dx, dy, dz, dt)` | `void`    | Submit desired displacement for this frame (metres).    |
| `isGrounded`           | `boolean` | True if the CC was on the ground after the last move.   |
| `groundNormalX/Y/Z`    | `number`  | World-space normal of the surface under the character.  |
| `groundEntity`         | `number`  | Entity index of the ground body (`-1` if airborne).     |
| `remove()`             | `void`    | Destroy the CC slot.                                    |

### Example

```typescript
export const PlayerMovement = defineSystem(() => {
  const input = useInput();
  const cc = useCharacterController({ stepHeight: 0.4, slopeLimit: Math.PI / 4 });

  onUpdate((dt) => {
    const moveX = input.axis('horizontal') * 5;
    const moveZ = input.axis('vertical') * 5;
    const gravity = cc.isGrounded ? 0 : -9.81 * dt;
    cc.move(moveX * dt, gravity, moveZ * dt, dt);
  });
});
```

---

## Pathfinding — `initNavGrid3D` / `findPath3D`

GWEN ships a lightweight grid-based **A\* pathfinder** (O(n log n) with binary min-heap) for 3D navigation.

### `initNavGrid3D`

```typescript
function initNavGrid3D(options: NavGridOptions3D): void;
```

| Option     | Type                                       | Default | Description                          |
| ---------- | ------------------------------------------ | ------- | ------------------------------------ |
| `minX`     | `number`                                   | required| World-space minimum X extent.        |
| `minZ`     | `number`                                   | required| World-space minimum Z extent.        |
| `maxX`     | `number`                                   | required| World-space maximum X extent.        |
| `maxZ`     | `number`                                   | required| World-space maximum Z extent.        |
| `cellSize` | `number`                                   | `1`     | Grid cell size (metres).             |
| `walkable` | `(x: number, z: number) => boolean`        | `() => true` | Returns false for blocked cells.|

### `findPath3D`

```typescript
function findPath3D(from: Vec3, to: Vec3, options?: PathfindOptions3D): Vec3[] | null;
```

Returns waypoints from `from` to `to`, or `null` if no path exists.

| Option        | Type      | Default | Description                                              |
| ------------- | --------- | ------- | -------------------------------------------------------- |
| `maxNodes`    | `number`  | `512`   | Maximum A\* nodes to expand.                            |
| `allowDiagonal` | `boolean` | `true` | Allow diagonal grid moves.                             |

### Example

```typescript
initNavGrid3D({ minX: 0, minZ: 0, maxX: 30, maxZ: 30, cellSize: 1,
  walkable: (x, z) => !tileMap.isWall(x, z) });

const path = findPath3D(enemy.position, player.position);
if (path && path.length > 1) {
  const next = path[1]!;
  cc.move((next.x - enemy.position.x) * speed * dt, 0, (next.z - enemy.position.z) * speed * dt, dt);
}
```
