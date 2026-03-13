---
name: gwen-physics2d
description: Expert skill for Rapier2D WASM integration, handling rigid bodies, named layers, tilemap chunks, and sensor state machines.
---

# Physics2D Expert Skill

## Context
The Physics2D plugin is a high-performance bridge to Rapier2D via WASM. It simulates in **meters** (`1m = 50px`) and uses a **Plugin Data Bus** for transforms/events.

## Instructions

### 1. Advanced Configuration
Prefer constructor-style plugin usage in `gwen.config.ts`.

```typescript
import { Physics2D } from '@djodjonx/gwen-plugin-physics2d';

export default defineConfig({
  plugins: [
    new Physics2D({
      gravity: -9.81,
      qualityPreset: 'high',
      eventMode: 'hybrid',
      layers: {
        player: 0,
        enemy: 1,
        ground: 2,
        sensor: 3,
      },
    }),
  ],
});
```

Note: `physics2D(config)` still exists for compatibility but is deprecated.

### 2. Prefab Extensions (Recommended vNext)
Physics is typically declared in prefab extensions.

- **Body types**: `fixed`, `dynamic`, `kinematic`
- **Colliders**: use `colliders[]` (multi-collider supported)
- **Layers**: `membershipLayers` (who I am), `filterLayers` (what I hit)

```json
{
  "extensions": {
    "physics": {
      "bodyType": "dynamic",
      "linearDamping": 0.5,
      "colliders": [
        {
          "id": "body",
          "shape": "box",
          "hw": 16,
          "hh": 32,
          "membershipLayers": ["player"],
          "filterLayers": ["ground", "enemy"]
        },
        {
          "id": "foot_sensor",
          "shape": "box",
          "hw": 12,
          "hh": 4,
          "offsetX": 0,
          "offsetY": 32,
          "isSensor": true,
          "membershipLayers": ["sensor"],
          "filterLayers": ["ground"]
        }
      ]
    }
  }
}
```

### 3. Service API (`Physics2DAPI`)
Access with `api.services.get('physics')`.

- **Kinematics**: `setKinematicPosition(slot, x, y)`
- **Velocity**: `setLinearVelocity(slot, vx, vy)`, `getLinearVelocity(slot)`
- **Sensors**: `getSensorState(slot, sensorId)` -> `{ contactCount, isActive }`
- **Impulses**: `applyImpulse(slot, x, y)`
- **Events**: prefer `getCollisionEventsBatch()` over legacy `getCollisionEvents()`

### 4. Tilemap Physics
Use bake helpers + chunk runtime for large static environments.

```typescript
import { buildTilemapPhysicsChunks } from '@djodjonx/gwen-plugin-physics2d/tilemap';

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

### 5. Event Handling & Hooks

- `physics:collision`: high-level hook with resolved `CollisionContact`
- `physics:collision:batch`: optional convenience hook in `eventMode: 'hybrid'`
- `physics:sensor:changed`: fired only on sensor state transitions
- `onCollision` callback: can be declared directly in `extensions.physics`

## Available Resources

- `packages/@djodjonx/plugin-physics2d/src/types.ts`
- `packages/@djodjonx/plugin-physics2d/src/systems.ts`
- `packages/@djodjonx/plugin-physics2d/src/helpers/tilemap.ts`
- `packages/@djodjonx/plugin-physics2d/docs/API.md`
- `packages/@djodjonx/plugin-physics2d/docs/MIGRATION.md`

## Constraints

- **Units**: API calls use **meters**; divide pixels by `50` for manual calls.
- **Cleanup**: bodies are removed automatically on `entity:destroy`.
- **CCD**: expensive; enable globally via high presets or locally per body with `ccdEnabled`.
- **Layers**: max `32` named layers (`1 << bitIndex`).
- **Legacy**: top-level prefab collider fields (`radius`, `hw`, `hh`, etc.) are deprecated; use `colliders[]`.
