import { describe, expect, it, vi } from 'vitest';
import type { Physics2DAPI } from '@gwenengine/physics2d/core';
import {
  buildPlatformerStaticGeometry,
  createPlatformerStaticGeometry,
  loadPlatformerStaticGeometry,
} from '../src/index.js';

describe('platformer static geometry helpers', () => {
  it('builds merged geometry from pixel blocks', () => {
    const chunkMap = buildPlatformerStaticGeometry({
      blocks: [
        { x: 640, y: 550, w: 1280, h: 64 },
        { x: 300, y: 420, w: 128, h: 32 },
      ],
      worldWidthPx: 1280,
      worldHeightPx: 640,
      tileSizePx: 16,
      chunkSizeTiles: 16,
    });

    expect(chunkMap.chunks.length).toBeGreaterThan(0);
    const totalColliders = chunkMap.chunks.reduce((acc, chunk) => acc + chunk.colliders.length, 0);
    expect(totalColliders).toBeGreaterThan(0);
  });

  it('loads all chunks and unloads them via handle', () => {
    const chunkMap = buildPlatformerStaticGeometry({
      blocks: [{ x: 640, y: 550, w: 1280, h: 64 }],
      worldWidthPx: 1280,
      worldHeightPx: 640,
    });

    const loadTilemapPhysicsChunk = vi.fn();
    const unloadTilemapPhysicsChunk = vi.fn();
    const physics = {
      loadTilemapPhysicsChunk,
      unloadTilemapPhysicsChunk,
    } as unknown as Physics2DAPI;

    const handle = loadPlatformerStaticGeometry(physics, chunkMap, { origin: { x: 0, y: 0 } });

    expect(handle.chunkKeys).toHaveLength(chunkMap.chunks.length);
    expect(physics.loadTilemapPhysicsChunk).toHaveBeenCalledTimes(chunkMap.chunks.length);

    const distinctOrigins = new Set(
      loadTilemapPhysicsChunk.mock.calls.map((call: any[]) => `${call[1]}:${call[2]}`),
    );
    expect(distinctOrigins.size).toBeGreaterThan(1);

    handle.unload();
    expect(physics.unloadTilemapPhysicsChunk).toHaveBeenCalledTimes(chunkMap.chunks.length);
  });

  it('builds and loads in one call', () => {
    const loadTilemapPhysicsChunk = vi.fn();
    const unloadTilemapPhysicsChunk = vi.fn();
    const physics = {
      loadTilemapPhysicsChunk,
      unloadTilemapPhysicsChunk,
    } as unknown as Physics2DAPI;

    const handle = createPlatformerStaticGeometry(
      physics,
      {
        blocks: [{ x: 640, y: 550, w: 1280, h: 64 }],
        worldWidthPx: 1280,
        worldHeightPx: 640,
      },
      { origin: { x: 0, y: 0 } },
    );

    expect(handle.chunkKeys.length).toBeGreaterThan(0);
    expect(physics.loadTilemapPhysicsChunk).toHaveBeenCalled();
  });

  it('loads adjacent chunks with a stable chunk-grid world step', () => {
    const loadTilemapPhysicsChunk = vi.fn();
    const unloadTilemapPhysicsChunk = vi.fn();
    const physics = {
      loadTilemapPhysicsChunk,
      unloadTilemapPhysicsChunk,
    } as unknown as Physics2DAPI;

    const chunkMap = buildPlatformerStaticGeometry({
      // 3 chunk columns at 16 tiles/chunk with 16px tiles -> 768px total width
      blocks: [{ x: 384, y: 550, w: 768, h: 64 }],
      worldWidthPx: 768,
      worldHeightPx: 640,
      tileSizePx: 16,
      chunkSizeTiles: 16,
    });

    loadPlatformerStaticGeometry(physics, chunkMap, { origin: { x: 0, y: 0 } });

    const chunkWorldSizeM = (16 * 16) / 50; // 5.12m
    const calls = loadTilemapPhysicsChunk.mock.calls;
    const withSameRow = calls
      .map((call: any[]) => ({ x: call[1] as number, y: call[2] as number }))
      .filter((p: { y: number }) => p.y === 0);

    // At least 3 chunks on row 0: x = 0, 5.12, 10.24
    expect(withSameRow.length).toBeGreaterThanOrEqual(3);
    expect(withSameRow[1].x - withSameRow[0].x).toBeCloseTo(chunkWorldSizeM, 6);
    expect(withSameRow[2].x - withSameRow[1].x).toBeCloseTo(chunkWorldSizeM, 6);
  });
});
