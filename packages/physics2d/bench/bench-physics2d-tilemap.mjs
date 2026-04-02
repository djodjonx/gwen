#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const pluginDistEntry = path.resolve(
  repoRoot,
  'packages/physics2d/dist/index.js',
);

const args = new Set(process.argv.slice(2));
const jsonMode = args.has('--json');

function makeTiles(width, height) {
  const tiles = new Array(width * height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Deterministic synthetic terrain pattern.
      if (y > height - 5 || (y % 11 === 0 && x % 3 !== 0) || (x % 17 === 0 && y % 5 < 3)) {
        tiles[y * width + x] = 1;
      }
    }
  }
  return tiles;
}

const mod = await import(pathToFileURL(pluginDistEntry).href);
const { buildTilemapPhysicsChunks, patchTilemapPhysicsChunk } = mod;

if (typeof buildTilemapPhysicsChunks !== 'function' || typeof patchTilemapPhysicsChunk !== 'function') {
  throw new Error('Tilemap bench failed: buildTilemapPhysicsChunks/patchTilemapPhysicsChunk exports are missing.');
}

const mapWidthTiles = 256;
const mapHeightTiles = 128;
const chunkSizeTiles = 16;
const tileSizePx = 16;
const tiles = makeTiles(mapWidthTiles, mapHeightTiles);

const t0 = performance.now();
const baked = buildTilemapPhysicsChunks({
  tiles,
  mapWidthTiles,
  mapHeightTiles,
  chunkSizeTiles,
  tileSizePx,
});
const t1 = performance.now();

const totalColliders = baked.chunks.reduce((sum, c) => sum + c.colliders.length, 0);

// Deterministic patch: toggle one tile inside chunk (3,2).
const patchedTiles = [...tiles];
const patchX = 3 * chunkSizeTiles + 2;
const patchY = 2 * chunkSizeTiles + 1;
const idx = patchY * mapWidthTiles + patchX;
patchedTiles[idx] = patchedTiles[idx] === 0 ? 1 : 0;

const p0 = performance.now();
const patched = patchTilemapPhysicsChunk({
  source: {
    tiles: patchedTiles,
    mapWidthTiles,
    mapHeightTiles,
    chunkSizeTiles,
    tileSizePx,
  },
  chunkX: 3,
  chunkY: 2,
  previous: baked,
});
const p1 = performance.now();

const oldChunk = baked.chunks.find((c) => c.key === '3:2');
const newChunk = patched.chunks.find((c) => c.key === '3:2');

const result = {
  scenario: 'synthetic-256x128',
  mapWidthTiles,
  mapHeightTiles,
  chunkSizeTiles,
  tileSizePx,
  chunks: baked.chunks.length,
  colliders: totalColliders,
  buildMs: Number((t1 - t0).toFixed(3)),
  patchMs: Number((p1 - p0).toFixed(3)),
  changedChunkKey: '3:2',
  changedChunkChecksumBefore: oldChunk?.checksum ?? null,
  changedChunkChecksumAfter: newChunk?.checksum ?? null,
};

if (jsonMode) {
  console.log(JSON.stringify(result));
} else {
  console.log('[bench:physics:tilemap] result');
  console.log(JSON.stringify(result, null, 2));
}

