/**
 * E2E-like integration tests for platformer grounding contracts.
 *
 * These tests stay inside the library test suite on purpose: they validate
 * the public kit APIs used by playgrounds without adding root-level script noise.
 */
import { describe, expect, it, vi } from 'vitest';
import { SENSOR_ID_FOOT, type Physics2DAPI } from '@gwenjs/physics2d/core';
import { createPlayerPrefab, createPlatformerStaticGeometry } from '../src/index.js';

describe('e2e grounding contracts (library scoped)', () => {
  it('builds player colliders with a foot sensor offset that touches body bottom', () => {
    const prefab = createPlayerPrefab({
      colliders: {
        body: { w: 28, h: 28 },
        foot: { w: 24, h: 6 },
      },
    });

    const physicsExt = (
      prefab.extensions as { physics: { colliders: Array<Record<string, unknown>> } }
    ).physics;

    expect(physicsExt.colliders).toHaveLength(2);

    const body = physicsExt.colliders[0];
    const foot = physicsExt.colliders[1];

    expect(body.hw).toBe(14);
    expect(body.hh).toBe(14);
    expect(foot.hw).toBe(12);
    expect(foot.hh).toBe(3);
    // Default offset = bodyHalfHeight + footHalfHeight => 14 + 3 = 17px
    expect(foot.offsetY).toBe(17);
    expect(foot.colliderId).toBe(SENSOR_ID_FOOT);
    expect(foot.isSensor).toBe(true);
  });

  it('loads static chunk colliders at chunk-grid world offsets (no chunk stacking)', () => {
    const loadTilemapPhysicsChunk = vi.fn();
    const unloadTilemapPhysicsChunk = vi.fn();
    const physics = {
      loadTilemapPhysicsChunk,
      unloadTilemapPhysicsChunk,
    } as unknown as Physics2DAPI;

    const handle = createPlatformerStaticGeometry(
      physics,
      {
        // 3 columns of chunks with 16x16 tiles at 16px/tile => 768px world width
        blocks: [{ x: 384, y: 550, w: 768, h: 64 }],
        worldWidthPx: 768,
        worldHeightPx: 640,
        tileSizePx: 16,
        chunkSizeTiles: 16,
      },
      { origin: { x: 1, y: 2 } },
    );

    const chunkWorldSizeM = (16 * 16) / 50; // 5.12m
    const calls = loadTilemapPhysicsChunk.mock.calls;

    // Keep only chunks on the same row to check X stepping.
    const row0 = calls
      .map((call: any[]) => ({ x: call[1] as number, y: call[2] as number }))
      .filter((entry: { y: number }) => entry.y === 2);

    expect(row0.length).toBeGreaterThanOrEqual(3);
    expect(row0[0].x).toBeCloseTo(1, 6);
    expect(row0[1].x - row0[0].x).toBeCloseTo(chunkWorldSizeM, 6);
    expect(row0[2].x - row0[1].x).toBeCloseTo(chunkWorldSizeM, 6);

    // Ensure we can cleanly unload everything loaded by the helper.
    handle.unload();
    expect(physics.unloadTilemapPhysicsChunk).toHaveBeenCalledTimes(handle.chunkKeys.length);
  });
});
