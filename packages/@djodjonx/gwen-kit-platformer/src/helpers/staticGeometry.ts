import {
  buildStaticGeometryChunk,
  loadStaticGeometryChunk,
} from '@djodjonx/gwen-plugin-physics2d/helpers/static-geometry';
import type { Physics2DAPI, TilemapPhysicsChunkMap } from '@djodjonx/gwen-plugin-physics2d/core';

/** Pixel-authored rectangular platform block centered on `(x, y)`. */
export interface PlatformerLevelBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Build options for static merged geometry. */
export interface BuildPlatformerStaticGeometryOptions {
  blocks: ReadonlyArray<PlatformerLevelBlock>;
  worldWidthPx: number;
  worldHeightPx: number;
  tileSizePx?: number;
  chunkSizeTiles?: number;
}

/** Runtime options used when loading baked chunks into physics. */
export interface LoadPlatformerStaticGeometryOptions {
  origin?: { x: number; y: number };
}

/** Handle returned by geometry loader. */
export interface PlatformerStaticGeometryHandle {
  readonly chunkMap: TilemapPhysicsChunkMap;
  readonly chunkKeys: ReadonlyArray<string>;
  unload(): void;
}

const DEFAULT_TILE_SIZE_PX = 16;
const DEFAULT_CHUNK_SIZE_TILES = 16;
const DEFAULT_PIXELS_PER_METER = 50;

/**
 * Build a merged static geometry chunk map from pixel-authored level blocks.
 *
 * This helper is DX-first for platformers: authors place blocks in pixels,
 * while physics colliders are baked as merged rectangles to remove internal edges.
 */
export function buildPlatformerStaticGeometry(
  options: BuildPlatformerStaticGeometryOptions,
): TilemapPhysicsChunkMap {
  const tileSizePx = options.tileSizePx ?? DEFAULT_TILE_SIZE_PX;
  const mapWidthTiles = Math.ceil(options.worldWidthPx / tileSizePx);
  const mapHeightTiles = Math.ceil(options.worldHeightPx / tileSizePx);
  const tiles = Array(mapWidthTiles * mapHeightTiles).fill(0);

  for (const block of options.blocks) {
    fillSolidRect(tiles, mapWidthTiles, mapHeightTiles, block, tileSizePx);
  }

  return buildStaticGeometryChunk({
    tiles,
    mapWidthTiles,
    mapHeightTiles,
    tileSizePx,
    chunkSizeTiles: options.chunkSizeTiles ?? DEFAULT_CHUNK_SIZE_TILES,
  });
}

/**
 * Load all baked chunks and return a disposable handle.
 *
 * Each chunk is loaded at:
 * - `origin` (meters) +
 * - chunk grid offset (`chunkX/chunkY * chunkWorldSizeMeters`).
 *
 * This keeps chunk-local collider offsets correct at runtime and prevents
 * all chunks from stacking at the same world position.
 */
export function loadPlatformerStaticGeometry(
  physics: Physics2DAPI,
  chunkMap: TilemapPhysicsChunkMap,
  options: LoadPlatformerStaticGeometryOptions = {},
): PlatformerStaticGeometryHandle {
  const origin = options.origin ?? { x: 0, y: 0 };
  const chunkWorldSizeM =
    (chunkMap.chunkSizeTiles * chunkMap.tileSizePx) / DEFAULT_PIXELS_PER_METER;
  const chunkKeys = chunkMap.chunks.map((chunk) => {
    const worldX = origin.x + chunk.chunkX * chunkWorldSizeM;
    const worldY = origin.y + chunk.chunkY * chunkWorldSizeM;
    return loadStaticGeometryChunk(physics, chunk, { x: worldX, y: worldY });
  });

  return {
    chunkMap,
    chunkKeys,
    unload() {
      for (const key of chunkKeys) {
        physics.unloadTilemapPhysicsChunk(key);
      }
    },
  };
}

/**
 * Build and load merged static geometry in one step.
 */
export function createPlatformerStaticGeometry(
  physics: Physics2DAPI,
  buildOptions: BuildPlatformerStaticGeometryOptions,
  loadOptions: LoadPlatformerStaticGeometryOptions = {},
): PlatformerStaticGeometryHandle {
  const chunkMap = buildPlatformerStaticGeometry(buildOptions);
  return loadPlatformerStaticGeometry(physics, chunkMap, loadOptions);
}

function fillSolidRect(
  tiles: number[],
  mapWidthTiles: number,
  mapHeightTiles: number,
  block: PlatformerLevelBlock,
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
