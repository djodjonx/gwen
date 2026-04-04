/**
 * @file @gwenjs/physics3d-fracture — TypeScript bindings for the Voronoi fracture WASM module.
 *
 * Usage (via RFC-008 loadWasmModule):
 * ```typescript
 * import { parseFractureBuffer } from '@gwenjs/physics3d-fracture'
 *
 * // In an actor — fracture module loaded via engine.loadWasmModule({ name: 'fracture', ... })
 * const fracture = useWasmModule('fracture')
 *
 * onContact(({ impulse, localPoint }) => {
 *   if (impulse < 200) return
 *   const rawBuf = fracture.voronoi_fracture(
 *     meshVerts, meshIdxs,
 *     localPoint.x, localPoint.y, localPoint.z,
 *     12,               // shard count
 *     Date.now() & 0xFFFFFFFF, // seed
 *   )
 *   const { shards } = parseFractureBuffer(new Float32Array(rawBuf.buffer))
 *   for (const shard of shards) {
 *     const debris = instantiate(GlassShardPrefab, { position: getPosition() })
 *     // GlassShardPrefab actor handles physics per shard
 *   }
 *   destroyActor()
 * })
 * ```
 */

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A single fracture shard produced by {@link parseFractureBuffer}.
 *
 * `vertices` and `indices` are ready to pass directly to
 * `useMeshCollider({ vertices, indices })`.
 */
export interface FractureShard {
  /** Flat vertex buffer `[x0,y0,z0, x1,y1,z1, ...]` for this shard. */
  vertices: Float32Array;
  /** Flat index buffer `[a0,b0,c0, ...]` referencing `vertices`. */
  indices: Uint32Array;
}

/**
 * The result of parsing a raw `voronoi_fracture` output buffer.
 */
export interface FractureResult {
  /** Non-empty mesh shards — length equals the number of non-empty Voronoi cells. */
  shards: FractureShard[];
}

// ─── Buffer parser ────────────────────────────────────────────────────────────

/**
 * Parse the raw `f32` output buffer returned by `voronoi_fracture()` into
 * typed {@link FractureShard} objects.
 *
 * The buffer layout is:
 * ```
 * [f32: shard_count]
 * per shard {
 *   [f32: vertex_count]
 *   [f32: triangle_count]
 *   [f32 × vertex_count × 3]  // vertex positions
 *   [f32 × triangle_count × 3] // indices encoded as f32
 * }
 * ```
 *
 * @param buffer - The raw `Float32Array` returned by the WASM `voronoi_fracture` function.
 * @returns A {@link FractureResult} containing all non-empty shards.
 *
 * @example
 * ```typescript
 * const rawBuf = fractureModule.voronoi_fracture(verts, idxs, ix, iy, iz, 8, seed)
 * const { shards } = parseFractureBuffer(new Float32Array(rawBuf.buffer))
 * shards.forEach((shard, i) => {
 *   console.log(`Shard ${i}: ${shard.vertices.length / 3} verts, ${shard.indices.length / 3} tris`)
 * })
 * ```
 */
export function parseFractureBuffer(buffer: Float32Array): FractureResult {
  if (buffer.length === 0) return { shards: [] };

  let offset = 0;
  const shardCount = buffer[offset++]!;
  const shards: FractureShard[] = [];

  for (let i = 0; i < shardCount; i++) {
    if (offset >= buffer.length) break;
    const vertCount = buffer[offset++]!;
    const triCount = buffer[offset++]!;
    if (vertCount === 0 || triCount === 0) continue;

    const vertices = buffer.slice(offset, offset + vertCount * 3);
    offset += vertCount * 3;

    // Indices are stored as f32 in the WASM output; cast each value to u32.
    const indexF32 = buffer.slice(offset, offset + triCount * 3);
    offset += triCount * 3;
    const indices = new Uint32Array(indexF32.length);
    for (let j = 0; j < indexF32.length; j++) {
      indices[j] = indexF32[j]! >>> 0;
    }

    shards.push({ vertices, indices });
  }

  return { shards };
}
