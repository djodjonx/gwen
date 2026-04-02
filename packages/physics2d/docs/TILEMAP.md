# Tilemap Physics Guide

This guide covers the Sprint 6 tilemap workflow:

1. bake physics chunks once from a tile grid,
2. load/unload chunks at runtime,
3. patch one chunk without rebaking the full map,
4. use material presets (`default`, `ice`, `rubber`) or custom overrides.

## Quick mental model

- `buildTilemapPhysicsChunks(...)` turns solid tiles into merged collider rectangles.
- each baked chunk is versioned and carries a deterministic `checksum`.
- `physics.loadTilemapPhysicsChunk(...)` creates one fixed Rapier body per chunk and attaches all baked colliders.
- `physics.patchTilemapPhysicsChunk(...)` replaces only one loaded chunk.

## Baking chunks

```ts
import { buildTilemapPhysicsChunks } from '@gwenjs/physics2d';

const baked = buildTilemapPhysicsChunks({
  tiles,
  mapWidthTiles: 128,
  mapHeightTiles: 64,
  chunkSizeTiles: 16,
  tileSizePx: 16,
  isSolidTile: (tile) => tile !== 0,
});
```

### Output contract

- `formatVersion` — currently `1`
- `chunks[]` — stable ordered list of baked chunks
- `chunk.key` — stable string key like `"3:2"`
- `chunk.checksum` — deterministic checksum of merged rectangles
- `chunk.colliders[]` — ready-to-load collider definitions in pixels

## Loading a chunk at runtime

```ts
const physics = api.services.get('physics');
const chunk = baked.chunks.find((c) => c.key === '0:0');

if (chunk) {
  physics.loadTilemapPhysicsChunk(
    chunk,
    0, // world x in metres
    0, // world y in metres
  );
}
```

### Debug fallback

When diagnosing bake issues, you can force the runtime to rebuild one collider per rectangle instead of trusting `chunk.colliders[]`:

```ts
physics.loadTilemapPhysicsChunk(chunk, worldX, worldY, { debugNaive: true });
```

Use this only as a debug path. It is intentionally less efficient.

## Unloading a chunk

```ts
physics.unloadTilemapPhysicsChunk('0:0');
```

This removes the fixed body and all attached colliders for that chunk.

## Patching one chunk

```ts
import {
  buildTilemapPhysicsChunks,
  patchTilemapPhysicsChunk,
} from '@gwenjs/physics2d';

const patchedBake = patchTilemapPhysicsChunk({
  source: {
    tiles: updatedTiles,
    mapWidthTiles: 128,
    mapHeightTiles: 64,
    chunkSizeTiles: 16,
    tileSizePx: 16,
  },
  chunkX: 3,
  chunkY: 2,
  previous: baked,
});

const patchedChunk = patchedBake.chunks.find((c) => c.key === '3:2');
if (patchedChunk) {
  physics.patchTilemapPhysicsChunk(patchedChunk, chunkWorldX, chunkWorldY);
}
```

## Helpers workflow (new)

Use helper subpaths to keep imports targeted:

```ts
import { buildStaticGeometryChunk } from '@gwenjs/physics2d/helpers/static-geometry';
import { createTilemapChunkOrchestrator } from '@gwenjs/physics2d/helpers/orchestration';
```

Minimal runtime flow:

1. Build once with `buildStaticGeometryChunk(source)`.
2. Create orchestrator with `createTilemapChunkOrchestrator(physics, { source, origin })`.
3. On camera update, call `orchestrator.syncVisibleChunks(visibleChunks)`.
4. For terrain edits, call `orchestrator.patchChunk(chunkX, chunkY, updatedSource)`.
5. On scene teardown, call `orchestrator.dispose()`.

## Materials on baked colliders

Every baked collider still uses the normal `PhysicsColliderDef` shape, so you can enrich or post-process them before runtime loading.

### Preset names

```ts
chunk.colliders = chunk.colliders.map((collider) => ({
  ...collider,
  material: 'ice',
}));
```

Available presets:

- `default` → friction `0.5`, restitution `0`, density `1.0`
- `ice` → friction `0.02`, restitution `0`, density `1.0`
- `rubber` → friction `1.2`, restitution `0.85`, density `1.0`

### Custom object + explicit override

```ts
chunk.colliders = chunk.colliders.map((collider) => ({
  ...collider,
  material: { friction: 0.9, restitution: 0.1, density: 2.0 },
  friction: 0.7, // explicit field wins over `material.friction`
}));
```

Resolution order is:

1. explicit `friction` / `restitution` / `density`
2. `material` preset or object
3. runtime fallback defaults

## Perf tips

- prefer chunk sizes between `16` and `32` tiles for platformer maps.
- keep chunk keys stable (`chunkX:chunkY`) so reload logic can skip unchanged checksums.
- load only nearby chunks around the camera/player.
- use `patchTilemapPhysicsChunk(...)` for destructible terrain instead of full rebakes.
- reserve `debugNaive` for diagnosis only.

## Determinism notes

- chunk rectangle merges are sorted deterministically
- chunk `checksum` changes only when the merged geometry changes
- `patchTilemapPhysicsChunk(...)` updates one chunk while keeping neighbors untouched

## Related docs

- API reference: `./API.md`
- Migration notes: `./MIGRATION.md`
