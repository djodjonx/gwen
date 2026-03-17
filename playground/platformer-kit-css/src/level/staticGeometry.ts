import { buildTilemapPhysicsChunks } from '@djodjonx/gwen-plugin-physics2d/helpers/static-geometry';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d/core';

export interface LevelBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelStaticGeometryHandle {
  readonly chunkKeys: ReadonlyArray<string>;
  unload(): void;
}

/**
 * Build and load merged static tilemap chunks for the CSS playground.
 *
 * Colliders in baked chunks are chunk-local. We therefore load each chunk at its
 * chunk-grid world offset in meters to preserve correct world placement.
 */
export function createLevelStaticGeometry(
  physics: Physics2DAPI,
  options: {
    blocks: ReadonlyArray<LevelBlock>;
    worldWidthPx: number;
    worldHeightPx: number;
    tileSizePx?: number;
    chunkSizeTiles?: number;
  },
): LevelStaticGeometryHandle {
  const pixelsPerMeter = 50;
  const tileSizePx = options.tileSizePx ?? 16;
  const mapWidthTiles = Math.ceil(options.worldWidthPx / tileSizePx);
  const mapHeightTiles = Math.ceil(options.worldHeightPx / tileSizePx);
  const tiles = Array(mapWidthTiles * mapHeightTiles).fill(0);

  for (const block of options.blocks) {
    fillSolidRect(tiles, mapWidthTiles, mapHeightTiles, block, tileSizePx);
  }

  const chunkMap = buildTilemapPhysicsChunks({
    tiles,
    mapWidthTiles,
    mapHeightTiles,
    tileSizePx,
    chunkSizeTiles: options.chunkSizeTiles ?? 16,
  });

  const chunkKeys: string[] = [];
  const chunkWorldSizeM = ((options.chunkSizeTiles ?? 16) * tileSizePx) / pixelsPerMeter;
  for (const chunk of chunkMap.chunks) {
    const worldX = chunk.chunkX * chunkWorldSizeM;
    const worldY = chunk.chunkY * chunkWorldSizeM;
    physics.loadTilemapPhysicsChunk(chunk, worldX, worldY);
    chunkKeys.push(chunk.key);
  }

  return {
    chunkKeys,
    unload() {
      for (const key of chunkKeys) {
        physics.unloadTilemapPhysicsChunk(key);
      }
    },
  };
}

function fillSolidRect(
  tiles: number[],
  mapWidthTiles: number,
  mapHeightTiles: number,
  block: LevelBlock,
  tileSizePx: number,
): void {
  const leftPx = block.x - block.w / 2;
  const topPx = block.y - block.h / 2;
  const rightPx = leftPx + block.w;
  const bottomPx = topPx + block.h;

  const startX = Math.max(0, Math.floor(leftPx / tileSizePx));
  const endX = Math.min(mapWidthTiles, Math.ceil(rightPx / tileSizePx));
  const startY = Math.max(0, Math.floor(topPx / tileSizePx));
  const endY = Math.min(mapHeightTiles, Math.ceil(bottomPx / tileSizePx));

  for (let y = startY; y < endY; y++) {
    const rowOffset = y * mapWidthTiles;
    for (let x = startX; x < endX; x++) {
      tiles[rowOffset + x] = 1;
    }
  }
}
