import { describe, it, expect } from 'vitest';
import { parseFractureBuffer } from '../src/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Manually encode a minimal fracture buffer matching the Rust output format:
 * [shard_count, vert_count, tri_count, ...verts, ...idxs_as_f32]
 */
function encodeShard(verts: number[], idxs: number[]): Float32Array {
  const vertCount = verts.length / 3;
  const triCount = idxs.length / 3;
  return new Float32Array([1, vertCount, triCount, ...verts, ...idxs]);
}

function encodeTwoShards(
  verts1: number[],
  idxs1: number[],
  verts2: number[],
  idxs2: number[],
): Float32Array {
  const vc1 = verts1.length / 3;
  const tc1 = idxs1.length / 3;
  const vc2 = verts2.length / 3;
  const tc2 = idxs2.length / 3;
  return new Float32Array([2, vc1, tc1, ...verts1, ...idxs1, vc2, tc2, ...verts2, ...idxs2]);
}

// ─── Test data ────────────────────────────────────────────────────────────────

const singleTriVerts = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const singleTriIdxs = [0, 1, 2];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseFractureBuffer', () => {
  it('returns empty shards for an empty buffer', () => {
    const result = parseFractureBuffer(new Float32Array([]));
    expect(result.shards).toHaveLength(0);
  });

  it('parses a single-shard buffer', () => {
    const buf = encodeShard(singleTriVerts, singleTriIdxs);
    const { shards } = parseFractureBuffer(buf);

    expect(shards).toHaveLength(1);
    expect(shards[0]!.vertices).toHaveLength(9); // 3 verts × 3 components
    expect(shards[0]!.indices).toHaveLength(3); // 1 triangle
  });

  it('vertices match the original float values', () => {
    const buf = encodeShard(singleTriVerts, singleTriIdxs);
    const { shards } = parseFractureBuffer(buf);

    const v = shards[0]!.vertices;
    expect(Array.from(v)).toEqual(singleTriVerts);
  });

  it('indices are returned as Uint32Array', () => {
    const buf = encodeShard(singleTriVerts, singleTriIdxs);
    const { shards } = parseFractureBuffer(buf);

    expect(shards[0]!.indices).toBeInstanceOf(Uint32Array);
  });

  it('indices match original values cast from f32', () => {
    const buf = encodeShard(singleTriVerts, singleTriIdxs);
    const { shards } = parseFractureBuffer(buf);

    expect(Array.from(shards[0]!.indices)).toEqual(singleTriIdxs);
  });

  it('parses two shards correctly', () => {
    const verts2 = [1, 0, 0, 2, 0, 0, 1, 1, 0];
    const idxs2 = [0, 1, 2];
    const buf = encodeTwoShards(singleTriVerts, singleTriIdxs, verts2, idxs2);
    const { shards } = parseFractureBuffer(buf);

    expect(shards).toHaveLength(2);
    expect(Array.from(shards[1]!.vertices)).toEqual(verts2);
  });

  it('second shard indices are Uint32Array with correct values', () => {
    const verts2 = [1, 0, 0, 2, 0, 0, 1, 1, 0];
    const idxs2 = [0, 1, 2];
    const buf = encodeTwoShards(singleTriVerts, singleTriIdxs, verts2, idxs2);
    const { shards } = parseFractureBuffer(buf);

    expect(shards[1]!.indices).toBeInstanceOf(Uint32Array);
    expect(Array.from(shards[1]!.indices)).toEqual(idxs2);
  });

  it('handles large index values correctly (u32 range)', () => {
    // Index value close to u32 max — must not be sign-extended.
    const bigIdxVerts = new Array(3 * 3).fill(0).map((_, i) => i * 0.1);
    const bigIdxs = [65535, 65534, 65533];
    const buf = encodeShard(bigIdxVerts, bigIdxs);
    const { shards } = parseFractureBuffer(buf);

    expect(Array.from(shards[0]!.indices)).toEqual(bigIdxs);
  });

  it('skips shards with zero vertex or triangle count', () => {
    // Manually construct buffer with a zero-vert shard followed by a valid one.
    const buf = new Float32Array([
      2, // 2 shards reported
      0,
      0, // shard 1: vert_count=0, tri_count=0 → skipped
      3,
      1, // shard 2: vert_count=3, tri_count=1
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      0, // 3 vertices
      0,
      1,
      2, // 1 triangle
    ]);
    const { shards } = parseFractureBuffer(buf);
    expect(shards).toHaveLength(1);
  });

  it('vertices property is a Float32Array', () => {
    const buf = encodeShard(singleTriVerts, singleTriIdxs);
    const { shards } = parseFractureBuffer(buf);
    expect(shards[0]!.vertices).toBeInstanceOf(Float32Array);
  });
});
