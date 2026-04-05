# @gwenjs/physics3d-fracture

Voronoi mesh fracture for GWEN Physics 3D. Splits a triangle mesh into N shards using a deterministic Voronoi site assignment algorithm, computed in a standalone WASM module.

## When to use

Use this package when you need runtime destructible geometry:
- Breaking windows, walls, or terrain on high-impact collisions
- Debris spawning from explosions
- Destructible environment tiles

## Installation

```bash
npm install @gwenjs/physics3d-fracture
```

Requires `@gwenjs/physics3d` to be installed and configured.

## Usage

```typescript
import { parseFractureBuffer } from '@gwenjs/physics3d-fracture';

// Inside an actor — fracture module loaded via engine.loadWasmModule
const fracture = useWasmModule('fracture');

onContact(({ impulse, localPoint }) => {
  if (impulse < 200) return; // Only fracture on strong impacts

  const rawBuf = fracture.voronoi_fracture(
    meshVerts,      // Float32Array: [x0,y0,z0, x1,y1,z1, ...]
    meshIdxs,       // Uint32Array:  [a0,b0,c0, ...]
    localPoint.x,   // Impact point (local space)
    localPoint.y,
    localPoint.z,
    12,             // Number of shards
    Date.now() & 0xFFFFFFFF, // Seed for reproducibility
  );

  const { shards } = parseFractureBuffer(new Float32Array(rawBuf.buffer));

  for (const shard of shards) {
    const debris = instantiate(GlassShardPrefab, { position: getPosition() });
    // GlassShardPrefab uses useMeshCollider({ vertices: shard.vertices, indices: shard.indices })
  }

  destroyActor();
});
```

## API

### `parseFractureBuffer(buffer: Float32Array): FractureResult`

Parse the raw `f32` output buffer returned by `voronoi_fracture()` into typed shard objects.

### `FractureShard`

```typescript
interface FractureShard {
  /** Flat vertex buffer [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Flat index buffer [a0,b0,c0, ...] — ready for useMeshCollider() */
  indices: Uint32Array;
}
```

## WASM module loading

The fracture WASM is a **separate standalone module** — it is NOT included in the main gwen-core WASM. Register it in your app config:

```typescript
// gwen.config.ts
export default defineConfig({
  wasmModules: [
    { name: 'fracture', url: '/wasm/gwen_physics3d_fracture_bg.wasm' },
  ],
});
```

## Performance notes

- Algorithm complexity: O(triangles × shard_count) — fast for ≤ 64 shards on meshes up to ~10 000 triangles
- Prefer calling from a Web Worker for very complex meshes to avoid frame drops
- The fracture is deterministic — same `seed` + same mesh always produces the same shards

## See also

- `@gwenjs/physics3d` — 3D rigid body physics
- `useMeshCollider` — Attach the shard geometry as a physics collider
