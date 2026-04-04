# Physics 3D Fracture

**Package:** `@gwenjs/physics3d-fracture`

Real-time Voronoi mesh fracture for GWEN Physics 3D. Implemented as a **separate WASM module** (not bundled with `gwen-core`) so it only adds weight to builds that need it.

---

## Installation

```bash
gwen add @gwenjs/physics3d-fracture
```

---

## How It Works

The fracture module is loaded at runtime via the [RFC-008 WASM module system](/kit/wasm-plugin):

```typescript
const fractureModule = await engine.loadWasmModule({
  name: 'physics3d-fracture',
  url: new URL('./node_modules/@gwenjs/physics3d-fracture/dist/fracture.wasm', import.meta.url).href,
});
```

Once loaded, `fractureModule` exposes the `voronoi_fracture` function. Its raw output is a flat `Float32Array` — use `parseFractureBuffer` from this package to convert it into typed `FractureShard` objects.

---

## API Reference

### `voronoi_fracture` (WASM export)

Fractures a triangle mesh into up to `shardCount` pieces using Voronoi site assignment.

```typescript
fractureModule.voronoi_fracture(
  verticesFlat: Float32Array,  // [x0,y0,z0, x1,y1,z1, ...]
  indicesFlat:  Uint32Array,   // [a0,b0,c0, ...]
  impactX: number,             // impact point in local mesh space
  impactY: number,
  impactZ: number,
  shardCount: number,          // desired shards (1–64 recommended)
  seed: number,                // LCG seed for reproducible patterns
): Float32Array                // raw output buffer — pass to parseFractureBuffer
```

**Algorithm:** O(triangles × shards). Handles meshes up to ~10 000 triangles at 60 fps with 64 shards. For larger meshes run the call in a Web Worker (see [Performance notes](#performance-notes)).

**Returns** an empty `Float32Array` if `verticesFlat` or `indicesFlat` is empty.

---

### `parseFractureBuffer`

Parse the raw WASM output buffer into typed shard objects.

```typescript
import { parseFractureBuffer } from '@gwenjs/physics3d-fracture';

function parseFractureBuffer(buffer: Float32Array): FractureResult;
```

**Buffer layout** (produced by `voronoi_fracture`):

```
[f32: shard_count]
per non-empty shard {
  [f32: vertex_count]
  [f32: triangle_count]
  [f32 × vertex_count × 3]    // vertex positions x,y,z
  [f32 × triangle_count × 3]  // re-mapped indices encoded as f32
}
```

---

### `FractureShard`

```typescript
interface FractureShard {
  /** Flat vertex buffer [x0,y0,z0, x1,y1,z1, ...] for this shard. */
  vertices: Float32Array;
  /** Flat index buffer [a0,b0,c0, ...] referencing vertices. */
  indices: Uint32Array;
}
```

`vertices` and `indices` are ready to pass directly to `useMeshCollider({ vertices, indices })` from `@gwenjs/physics3d`.

---

### `FractureResult`

```typescript
interface FractureResult {
  /** Non-empty mesh shards. Length equals the number of non-empty Voronoi cells. */
  shards: FractureShard[];
}
```

---

## End-to-End Example — Glass Wall Shattering

```typescript
import { defineActor, defineSystem, onSetup } from '@gwenjs/core';
import { useStaticBody, useMeshCollider, onContact } from '@gwenjs/physics3d';
import { parseFractureBuffer } from '@gwenjs/physics3d-fracture';
import type { FractureShard } from '@gwenjs/physics3d-fracture';

// ── 1. Load the fracture WASM module once at engine startup ────────────────────
export const FractureSystem = defineSystem(() => {
  onSetup(async () => {
    await engine.loadWasmModule({
      name: 'physics3d-fracture',
      url: new URL(
        './node_modules/@gwenjs/physics3d-fracture/dist/fracture.wasm',
        import.meta.url,
      ).href,
    });
  });
});

// ── 2. Glass wall actor ────────────────────────────────────────────────────────
const GlassWallActor = defineActor(GlassWallPrefab, () => {
  useStaticBody();
  useMeshCollider('./glass-wall.glb'); // BVH pre-baked by Vite plugin

  onContact(async ({ relativeVelocity, contactX, contactY, contactZ }) => {
    if (relativeVelocity < 50) return; // not hard enough to shatter

    const fractureModule = engine.getWasmModule('physics3d-fracture');
    const rawBuf = fractureModule.voronoi_fracture(
      glassVerts,         // source mesh vertices
      glassIndices,       // source mesh indices
      contactX,           // impact point
      contactY,
      contactZ,
      12,                 // number of shards
      (Date.now() & 0xffff_ffff) >>> 0, // seed
    );

    const { shards } = parseFractureBuffer(new Float32Array(rawBuf.buffer));

    // Spawn a debris entity for each shard
    for (const shard of shards) {
      instantiate(GlassShardPrefab, {
        position: getPosition(),
        mesh: shard, // passed through prefab props to useMeshCollider
      });
    }

    destroyActor();
  });
});

// ── 3. Glass shard prefab ──────────────────────────────────────────────────────
const GlassShardPrefab = definePrefab({
  mesh: null as FractureShard | null,
});

const GlassShardActor = defineActor(GlassShardPrefab, ({ mesh }) => {
  useDynamicBody({ mass: 0.1, gravityScale: 1.5 });

  if (mesh) {
    useMeshCollider({ vertices: mesh.vertices, indices: mesh.indices });
  }

  // Auto-destroy after 5 s to keep entity count bounded
  onUpdate((dt) => { /* lifetime tracking */ });
});
```

---

## Performance Notes

| Scenario | Triangles | Shards | Recommended approach |
| --- | --- | --- | --- |
| Small prop (crate, pot) | < 500 | ≤ 8 | Call on main thread in `onContact` |
| Medium object (window, wall panel) | 500–3 000 | ≤ 16 | Use a Web Worker (`postMessage` mesh data) |
| Large mesh (vehicle, building section) | > 3 000 | up to 64 | Worker required; expect 10–50 ms per fracture |

**Web Worker pattern:**

```typescript
// fracture.worker.ts
import { parseFractureBuffer } from '@gwenjs/physics3d-fracture';

self.onmessage = async ({ data: { verts, idxs, ix, iy, iz, count, seed, module } }) => {
  const raw = module.voronoi_fracture(verts, idxs, ix, iy, iz, count, seed);
  const result = parseFractureBuffer(new Float32Array(raw.buffer));
  self.postMessage(result, result.shards.flatMap(s => [s.vertices.buffer, s.indices.buffer]));
};
```

---

## Destructible Mesh Rebuild (Level 1 Destruction)

For simpler deformation — craters, bullet holes, terrain erosion — without full fracture, use [`MeshColliderHandle3D.rebuild()`](/api/physics3d#usemeshcollider--3d-only) from `@gwenjs/physics3d`:

```typescript
import { useMeshCollider } from '@gwenjs/physics3d';

const TerrainActor = defineActor(TerrainPrefab, () => {
  useStaticBody();
  const collider = useMeshCollider({ vertices: terrainVerts, indices: terrainIndices });

  onEvent('crater', async ({ x, z, radius }) => {
    const { verts, idxs } = deformMesh(terrainVerts, terrainIndices, x, z, radius);
    await collider.rebuild(verts, idxs); // BVH rebuilt off-thread via Web Worker
  });
});
```

This avoids spawning new entities and is suitable for terrain-level deformation (Level 1). Use `@gwenjs/physics3d-fracture` when you need the mesh to **split into independent physics bodies** (Level 2 / full fracture).

---

## See Also

- [Physics 3D Composables](/guide/physics3d-composables) — `useMeshCollider`, `useCompoundCollider`, `useStaticBody`
- [Physics 3D API Reference](/api/physics3d) — `MeshColliderHandle3D.rebuild()`, `preloadMeshCollider`
- [WASM Plugin Kit](/kit/wasm-plugin) — `engine.loadWasmModule` / RFC-008 pattern
