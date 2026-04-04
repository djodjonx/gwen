# RFC-05 — Tilemap & Spatial Streaming

## Status
`draft`

## Summary

Add `useTilemap(tiledJson)` and `useSpatialStreaming(options)` to `@gwenjs/physics2d`,
with a `gwen:tilemap` Vite plugin that pre-bakes physics chunks at build time.
This covers loading Tiled Editor JSON maps, creating physics bodies for tiles,
spawning point objects from map layers, and streaming large worlds by activating
only nearby chunks.

---

## Motivation

Level design for web games has no standard solution. Currently developers:
1. Manually create static bodies for every tile (error-prone, verbose)
2. Parse Tiled JSON at runtime (50KB+ per level, 200ms parsing on mobile)
3. No spatial streaming → entire world loaded at once (memory spikes)

RFC-05 solves all three:

```typescript
// ✅ One line to load a Tiled level with physics
const map = useTilemap(level1Json)

// Spawn objects from Tiled "entities" layer
for (const spawn of map.getObjects('spawns')) {
  placeActor(EnemyActor, { at: [spawn.x, spawn.y] })
}

// Stream chunks near the camera
useSpatialStreaming({ activationRadius: 3, deactivationRadius: 5 })
```

---

## Tiled Editor Integration

GWEN uses [Tiled Editor](https://www.mapeditor.org/) JSON format (`.tmj` / `.json`).

### Tile Layers → Physics Chunks

A Tiled map is divided into chunks (default 16×16 tiles). For each chunk,
`useTilemap` merges adjacent solid tiles into rectangles (the "greedy rectangle"
algorithm already in `@gwenjs/physics2d/src/tilemap.ts`) and creates a single
`static body` per merged rectangle.

```
Tiled JSON (50KB) → [gwen:tilemap Vite plugin] → pre-baked binary (8KB)
                                                      ↓
                    Runtime: useTilemap() reads binary, no JSON parsing
```

### Object Layers → Spawn Points

Tiled "Object Layer" with type-annotated objects map to spawn data:

```typescript
// Tiled map: Object Layer "spawns" with objects:
//   { name: "player-start", type: "PlayerSpawn", x: 48, y: 160 }
//   { name: "enemy-1",      type: "EnemySpawn",  x: 200, y: 160 }

const map = useTilemap(level1Json)
const playerSpawn = map.getObjects('spawns').find(o => o.type === 'PlayerSpawn')
const enemySpawns = map.getObjects('spawns').filter(o => o.type === 'EnemySpawn')

placeActor(PlayerActor, { at: [playerSpawn.x, playerSpawn.y] })
for (const s of enemySpawns) {
  placeActor(EnemyActor, { at: [s.x, s.y] })
}
```

---

## API

### `useTilemap(tiledJson, options?)`

```typescript
export interface TilemapOptions {
  /** Tile size in pixels (overrides Tiled map value). */
  tileSize?: number
  /** Layer name containing solid collision tiles. @default 'collision' */
  collisionLayer?: string
  /** Physics layers/mask for tile bodies. */
  layer?: number
  mask?: number
  /** If true, skips physics body creation (visual-only tilemap). @default false */
  visualOnly?: boolean
}

export interface TilemapHandle {
  /** The Tiled map width in tiles. */
  readonly width: number
  /** The Tiled map height in tiles. */
  readonly height: number
  /** The tile size in pixels. */
  readonly tileSize: number
  /**
   * Returns all objects from the named object layer.
   * Each object has `{ name, type, x, y, width?, height?, properties? }`.
   */
  getObjects(layerName: string): TiledObject[]
  /**
   * Returns all tile layer names in the map.
   */
  getLayers(): string[]
  /**
   * Check if a world position is inside a solid tile.
   * Useful for ground checks without physics queries.
   */
  isSolid(worldX: number, worldY: number): boolean
  /**
   * Dispose all physics bodies created by this tilemap.
   */
  dispose(): void
}

export interface TiledObject {
  id: number
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  properties: Record<string, string | number | boolean>
}

export function useTilemap(
  tiledJson: TiledMapData | string,  // object or virtual module path
  options?: TilemapOptions,
): TilemapHandle
```

---

### `useSpatialStreaming(options)`

Activates and deactivates tilemap chunks based on distance from a reference entity
(typically the camera or player). Uses the same chunk grid as `useTilemap`.

```typescript
export interface SpatialStreamingOptions {
  /**
   * Radius in chunks to activate around the anchor entity.
   * @default 3
   */
  activationRadius?: number
  /**
   * Radius in chunks to deactivate (hysteresis prevents flickering).
   * Must be > activationRadius.
   * @default activationRadius + 2
   */
  deactivationRadius?: number
  /**
   * The anchor entity ID (player or camera). Reads its Transform each frame.
   * @default current actor's entity
   */
  anchorEntityId?: bigint
}

export function useSpatialStreaming(options?: SpatialStreamingOptions): void
```

**Integration with `useTilemap`:**

`useSpatialStreaming` reads chunk data from the `useTilemap` handle registered
in the current layout context. If no tilemap is active, it is a no-op.

```typescript
const WorldActor = defineActor(WorldPrefab, () => {
  const map = useTilemap(worldMapJson, { collisionLayer: 'solid' })
  
  // Activate chunks near the player entity
  useSpatialStreaming({ activationRadius: 3, anchorEntityId: playerEntityId })
  
  // Place enemies from map objects
  for (const spawn of map.getObjects('enemy-spawns')) {
    placeActor(EnemyActor, { at: [spawn.x, spawn.y] })
  }
})
```

---

## Vite Plugin: `gwen:tilemap`

Transforms Tiled JSON imports into pre-baked binary format at build time.

### Build-time transformation

```typescript
// Before (runtime):
import level1 from './levels/level-1.tmj'
const map = useTilemap(level1)
// → 50KB JSON parsed at runtime, 200ms on mobile

// After (build time with gwen:tilemap):
import level1 from './levels/level-1.tmj?gwen-tilemap'
const map = useTilemap(level1)
// → 8KB binary, 0ms parse time (TypedArray view)
```

### What `gwen:tilemap` does

1. Detects `.tmj` / `.json` imports used with `useTilemap()`
2. Runs greedy rectangle merging on collision layer
3. Serializes physics chunks to a flat binary format:
   ```
   Header (8 bytes): magic 'GWTM', version u16, chunk_count u16
   Per chunk (24 bytes): chunkX i16, chunkY i16, rect_count u16, pad u16,
                          rect_offset u32, entity_count u16, entity_offset u32
   Rects (16 bytes each): x f32, y f32, w f32, h f32
   Entities (variable): JSON-encoded object layer data
   ```
4. Outputs `.gwtm` binary → loaded as `Uint8Array` at runtime
5. Full tilemap meta (layer names, map size) kept in tiny sidecar JSON

**Size comparison (typical 100×50 platformer level):**
| Format | Size | Parse time |
|--------|------|-----------|
| Tiled JSON (raw) | 48 KB | ~180ms |
| GWTM binary | 7.2 KB | ~0ms |
| Reduction | **85%** | **100%** |

### Plugin configuration

```typescript
// @gwenjs/physics2d/src/vite-plugin.ts (extended in RFC-05)
export function physics2dVitePlugin(options?: Physics2DViteOptions): Plugin[] {
  return [
    physics2dOptimizerPlugin(),   // RFC-04: layer inlining
    tilemapPlugin(options?.tilemap),  // RFC-05: tilemap pre-baking
  ]
}
```

Registered automatically via `module.ts`:
```typescript
kit.addVitePlugin(physics2dVitePlugin())
```

---

## TypeScript Import Support

Virtual module path for pre-baked tilemap:

```typescript
// vite-env.d.ts (generated by gwen prepare)
declare module '*.tmj' {
  import type { TiledMapData } from '@gwenjs/physics2d'
  const data: TiledMapData
  export default data
}

declare module '*.tmj?gwen-tilemap' {
  import type { PrebakedTilemapData } from '@gwenjs/physics2d'
  const data: PrebakedTilemapData
  export default data
}
```

---

## Greedy Rectangle Merging Algorithm

Already implemented in `packages/physics2d/src/helpers/tilemap.ts` as
`buildTilemapPhysicsChunks`. RFC-05 exposes this as `useTilemap` and moves
the computation to build time via the Vite plugin.

Algorithm (O(n) per row scan):
1. Scan rows left-to-right, grouping adjacent solid tiles into horizontal spans
2. Extend spans downward as long as the same columns are solid
3. Output `{ x, y, w, h }` rectangles
4. Create one static physics body per rectangle

---

## Integration Examples

### Platformer level

```typescript
import level1 from './levels/level-1.tmj'

const Level1Layout = defineLayout(() => {
  const map = useTilemap(level1, { collisionLayer: 'solid' })
  
  const playerSpawn = map.getObjects('spawns')[0]
  const player = placeActor(PlayerActor, { at: [playerSpawn.x, playerSpawn.y] })
  
  for (const e of map.getObjects('enemies')) {
    placeActor(EnemyActor, { at: [e.x, e.y], props: { type: e.type } })
  }
  
  return { player, map }
})
```

### Large open-world RPG

```typescript
import worldMap from './levels/world.tmj'

const WorldSystem = defineSystem(() => {
  // Only activate chunks near the player
  const map = useTilemap(worldMap, { collisionLayer: 'collision' })
  
  useSpatialStreaming({
    activationRadius: 4,
    deactivationRadius: 6,
    anchorEntityId: playerEntityId,
  })
  
  // Town NPC spawns from "npcs" layer
  for (const npc of map.getObjects('npcs')) {
    placeActor(NPCActor, {
      at: [npc.x, npc.y],
      props: { dialogueId: npc.properties.dialogue as string }
    })
  }
})
```

### Mario Kart-like (circuit)

```typescript
import circuit from './levels/circuit.tmj'

const CircuitLayout = defineLayout(() => {
  const map = useTilemap(circuit, { collisionLayer: 'track-boundaries' })
  
  // Spawn karts at grid positions from "start-grid" layer
  const startPositions = map.getObjects('start-grid')
    .sort((a, b) => a.properties.gridPos - b.properties.gridPos)
  
  const karts = startPositions.map((pos, i) =>
    placeActor(KartActor, { at: [pos.x, pos.y], props: { kartId: i } })
  )
  
  return { karts, map }
})
```

---

## Module Registration

`useTilemap`, `useSpatialStreaming` are added to `@gwenjs/physics2d/module.ts`:

```typescript
async setup(options, kit) {
  // ... existing auto-imports ...
  
  // RFC-05 additions:
  kit.addAutoImports([
    { name: 'useTilemap',          from: '@gwenjs/physics2d' },
    { name: 'useSpatialStreaming', from: '@gwenjs/physics2d' },
  ])
  
  // Vite plugin now includes tilemap pre-baking
  kit.addVitePlugin(physics2dVitePlugin(options))
  
  // Type template extended with tilemap types
  kit.addTypeTemplate({ /* ... */ })
}
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/physics2d/src/tilemap/use-tilemap.ts` | Create — composable |
| `packages/physics2d/src/tilemap/spatial-streaming.ts` | Create — streaming logic |
| `packages/physics2d/src/tilemap/tiled-parser.ts` | Create — Tiled JSON → GWTM binary |
| `packages/physics2d/src/tilemap/gwtm-loader.ts` | Create — GWTM binary → runtime handle |
| `packages/physics2d/src/tilemap/types.ts` | Create — TiledMapData, PrebakedTilemapData, TiledObject, TilemapHandle |
| `packages/physics2d/src/tilemap/index.ts` | Create — barrel |
| `packages/physics2d/src/vite-plugin.ts` | Modify — add tilemap pre-baking |
| `packages/physics2d/src/module.ts` | Modify — add useTilemap, useSpatialStreaming auto-imports |
| `packages/physics2d/src/index.ts` | Modify — re-export tilemap composables |
| `packages/physics2d/tests/tilemap/` | Create — Vitest tests |
| `packages/physics2d/tests/vite-tilemap-plugin.test.ts` | Create — build transformation tests |
| `docs/guide/tilemap.md` | Create — VitePress guide (Tiled setup, workflow) |
| `docs/api/tilemap.md` | Create — API reference |

---

## Acceptance Criteria

- [ ] `useTilemap(json)` creates physics bodies for all solid tiles in `collisionLayer`
- [ ] Rectangle merging reduces body count by ≥ 70% on a typical platformer level (vs one body/tile)
- [ ] `map.getObjects('layer')` returns all objects with correct `x, y, type, properties`
- [ ] `map.isSolid(x, y)` returns correct result without a physics query
- [ ] `useSpatialStreaming()` activates chunks within `activationRadius` and deactivates outside `deactivationRadius`
- [ ] No chunk is activated/deactivated more than once per frame regardless of entity velocity
- [ ] `gwen:tilemap` Vite plugin transforms `.tmj` → GWTM binary (unit tested)
- [ ] Pre-baked binary is ≤ 20% of original JSON size on a 100×50 test map
- [ ] `useTilemap(prebaked)` parse time is < 5ms on a 100×50 test map (mobile CPU sim)
- [ ] All new composables have Vitest tests with ≥ 80% coverage
- [ ] VitePress guide includes Tiled Editor setup screenshots/workflow

---

## Standards

### Language
All code, JSDoc, comments, test descriptions, and documentation **must be written in English**.

### JSDoc
Every public export follows the existing codebase JSDoc style:

```typescript
/**
 * Loads a Tiled Editor JSON map, creates static physics bodies for solid tiles,
 * and returns a handle for querying objects and tile data.
 *
 * Pre-baked binary format (`.gwtm`) is automatically used when imported via
 * the `gwen:tilemap` Vite plugin — no runtime JSON parsing overhead.
 *
 * @param tiledJson - Tiled map data object or pre-baked binary handle.
 * @param options - Optional configuration (collision layer name, tile size, etc.).
 * @returns A {@link TilemapHandle} for querying objects, checking solidity, and disposing bodies.
 * @throws {GwenPluginNotFoundError} If `@gwenjs/physics2d` is not registered.
 *
 * @example
 * ```typescript
 * import level1 from './levels/level-1.tmj'
 * const map = useTilemap(level1, { collisionLayer: 'solid' })
 * const spawns = map.getObjects('spawns')
 * ```
 *
 * @since 1.0.0
 */
export function useTilemap(tiledJson: TiledMapData, options?: TilemapOptions): TilemapHandle
```

Required tags: `@param`, `@returns`, `@throws`, `@example`, `@since`.

### Unit Tests (Vitest)

Test file location: `packages/physics2d/tests/tilemap/<unit>.test.ts`

Required test coverage:
- `use-tilemap.ts` — physics bodies created for all solid tiles; `isSolid(x, y)` correct
- `use-tilemap.ts` — `getObjects('layer')` returns all objects with correct properties
- `use-tilemap.ts` — `dispose()` removes all created bodies
- `spatial-streaming.ts` — chunks activated within radius; deactivated outside hysteresis radius
- `spatial-streaming.ts` — no chunk activated/deactivated more than once per frame
- `tiled-parser.ts` — greedy rectangle merging reduces rect count by ≥ 70% vs raw tiles
- `gwtm-loader.ts` — binary round-trip: parse → serialize → parse produces identical data
- `vite-tilemap-plugin.test.ts` — `.tmj` → GWTM binary size ≤ 20% of original JSON

Minimum coverage threshold: **80%** lines per file.

### Performance Tests

File: `packages/physics2d/tests/tilemap.perf.test.ts`

| Test | Threshold |
|------|-----------|
| Parse 100×50 Tiled JSON (raw) | < 50ms |
| Load pre-baked 100×50 GWTM binary | < 5ms |
| `isSolid(x, y)` — 10 000 queries | < 1ms |
| Spatial streaming — activate 9 chunks (3×3 grid) | < 2ms |
| Spatial streaming — deactivate 4 chunks | < 1ms |

### VitePress Documentation

- `docs/guide/tilemap.md` — Guide: Tiled Editor setup, map export workflow, useTilemap, getObjects, spatial streaming, Vite pre-baking
- `docs/api/tilemap.md` — Full API reference
- Sidebar entry under **Plugins → Physics 2D → Tilemap** and **API Reference**
- All prose in English
