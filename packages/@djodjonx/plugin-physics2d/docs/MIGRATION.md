# Migration Guide

## Current migration status

The plugin currently keeps legacy compatibility active while rolling out the newer contracts.

### Already migrated / recommended

- `extensions.physics.colliders[]` instead of top-level `radius` / `hw` / `hh`
- `getCollisionEventsBatch()` instead of `getCollisionEvents()`
- tilemap chunk baking/loading through `buildTilemapPhysicsChunks(...)` and `loadTilemapPhysicsChunk(...)`
- `material: 'default' | 'ice' | 'rubber'` for reusable terrain/body material presets

## Before / after

### Legacy mono-collider prefab

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    hw: 10,
    hh: 14,
    friction: 0.2,
  },
}
```

### vNext prefab

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    colliders: [{ shape: 'box', hw: 10, hh: 14, friction: 0.2 }],
  },
}
```

### vNext prefab with material preset

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    colliders: [{ shape: 'box', hw: 10, hh: 14, material: 'ice' }],
  },
}
```

### Legacy collision reads

```ts
const events = physics.getCollisionEvents();
```

### vNext collision reads

```ts
const batch = physics.getCollisionEventsBatch();
for (const ev of batch.events) {
  // ...
}
```

### Tilemap chunk workflow

```ts
const baked = buildTilemapPhysicsChunks({
  tiles,
  mapWidthTiles: 128,
  mapHeightTiles: 64,
  chunkSizeTiles: 16,
  tileSizePx: 16,
});

for (const chunk of baked.chunks) {
  physics.loadTilemapPhysicsChunk(chunk, worldX, worldY);
}
```

### Incremental patch of one chunk

```ts
const nextBake = patchTilemapPhysicsChunk({
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

const chunk = nextBake.chunks.find((c) => c.key === '3:2');
if (chunk) physics.patchTilemapPhysicsChunk(chunk, worldX, worldY);
```

## Material migration notes

- `material: 'default' | 'ice' | 'rubber'` is optional
- explicit `friction`, `restitution`, and `density` still win over the preset
- custom material objects remain supported:

```ts
{ material: { friction: 0.9, restitution: 0.1, density: 2.0 }, friction: 0.7 }
```

## Perf / rollout tips

- keep chunk keys stable as `${chunkX}:${chunkY}`
- prefer chunk patching over full rebakes for destructible terrain
- skip runtime reloads when `checksum` is unchanged
- use `debugNaive: true` only to diagnose bake mismatches
- prefer chunk sizes between `16` and `32` tiles for platformer maps

## Deprecation inventory

The inventory below is the source of truth for active Physics2D legacy APIs.
Gate contract:

- every TS `@deprecated` symbol in `src/types.ts` must appear here,
- `Deprecated since`, `Planned removal`, `Replacement`, `Tracking issue`, and `Tests` must stay filled,
- Rust deprecated symbols are currently expected to be **absent** in `crates/gwen-plugin-physics2d/src/`; if that changes, the audit gate must be extended in the same PR.

| Symbol | Language | Kind | Deprecated since | Planned removal | Replacement | Status | Tracking issue | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Physics2DPrefabExtension.radius` | TS | property | `0.4.0` | `1.0.0` | `colliders[0].radius` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.hw` | TS | property | `0.4.0` | `1.0.0` | `colliders[0].hw` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.hh` | TS | property | `0.4.0` | `1.0.0` | `colliders[0].hh` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.restitution` | TS | property | `0.4.0` | `1.0.0` | `colliders[].restitution` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.friction` | TS | property | `0.4.0` | `1.0.0` | `colliders[].friction` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.isSensor` | TS | property | `0.4.0` | `1.0.0` | `colliders[].isSensor` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.density` | TS | property | `0.4.0` | `1.0.0` | `colliders[].density` | active | `PHYS-S1-002` | `compat + new path` |
| `parseCollisionEvents` | TS | function | `0.4.0` | `1.0.0` | `readCollisionEventsFromBuffer` | active | `PHYS-S1-003` | `compat + new path` |
| `Physics2DAPI.getCollisionEvents` | TS | method | `0.4.0` | `1.0.0` | `getCollisionEventsBatch` | active | `PHYS-S1-007` | `compat + new path` |

## Checklist per PR touching legacy APIs

- [ ] code symbol tagged with `@deprecated`
- [ ] inventory updated
- [ ] compat path tested
- [ ] replacement path tested
- [ ] docs examples updated
