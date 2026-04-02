---
name: gwen-physics2d
description: Expert skill for Rapier2D WASM integration, handling rigid bodies, named layers, tilemap chunks, and sensor state machines.
---

# Physics2D Expert Skill

## Context
The Physics2D plugin is a high-performance bridge to Rapier2D via WASM. It handles the simulation in **Meters** (1m = 50px) and communicates via a **Plugin Data Bus** for transforms and events.

## Instructions

### 1. Advanced Configuration
Define named layers and quality presets in `gwen.config.ts`.
```typescript
import { physics2D } from '@gwenjs/physics2d';

export default defineConfig({
  plugins: [
    physics2D({
      gravity: -9.81,
      qualityPreset: 'high', // Enables CCD and high solver iterations
      eventMode: 'hybrid',   // Enables both batch hooks and per-entity callbacks
      layers: {
        player: 0,
        enemy: 1,
        ground: 2,
        sensor: 3
      }
    })
  ],
});
```

### 2. Prefab Extensions (The Automated Way)
Physics bodies and colliders are typically declared in prefabs.
- **Body Types**: `dynamic` (full physics), `static` (immovable), `kinematic_velocity` or `kinematic_position`.
- **Colliders**: Multiple colliders per entity are supported.
- **Layers**: Use names defined in config. `membershipLayers` (who I am), `filterLayers` (what I hit).

```json
{
  "extensions": {
    "physics": {
      "bodyType": "dynamic",
      "fixedRotation": true,
      "linearDamping": 0.5,
      "colliders": [
        {
          "id": "body",
          "shape": "box", "hw": 16, "hh": 32,
          "membershipLayers": ["player"],
          "filterLayers": ["ground", "enemy"]
        },
        {
          "id": "foot_sensor",
          "shape": "box", "hw": 12, "hh": 4, "offsetX": 0, "offsetY": 32,
          "isSensor": true,
          "membershipLayers": ["sensor"],
          "filterLayers": ["ground"]
        }
      ]
    }
  }
}
```

### 3. Service API (Physics2DAPI)
Access via `api.services.get('physics')`.
- **Kinematics**: Use `setKinematicPosition(slot, x, y)` for player-controlled entities that need to push physics objects.
- **Velocities**: `setLinearVelocity(slot, vx, vy)` and `getLinearVelocity(slot)`.
- **Sensors**: `getSensorState(slot, sensorId)` returns `{ contactCount, isActive }`. Useful for ground detection.
- **Impulses**: `applyImpulse(slot, x, y)` for explosions or jump forces.

### 4. Tilemap Physics
Use the `loadTilemapPhysicsChunk` helper to handle large static environments efficiently.
```typescript
const physics = api.services.get('physics');
// chunk comes from buildTilemapPhysicsChunks helper
physics.loadTilemapPhysicsChunk(chunk, x, y, {
  layers: { membershipLayers: ['ground'], filterLayers: ['player', 'enemy'] }
});
```

### 5. Event Handling & Hooks
- `physics:collision`: High-level hook providing `CollisionContact` (EntityIds, ColliderIds).
- `physics:sensor:changed`: Fired only when a sensor enters or leaves contact.
- `onCollision` Callback: Can be defined directly in the prefab extension to handle logic locally.

## Available Resources
- `packages/@gwenjs/plugin-physics2d/src/types.ts`: Constants like `PHYSICS_MATERIAL_PRESETS`.
- `packages/@gwenjs/plugin-physics2d/src/systems.ts`: `createPlatformerGroundedSystem` (uses sensors).
- `packages/@gwenjs/plugin-physics2d/src/helpers/tilemap.ts`: Optimization logic for tilemaps.

## Constraints
- **Unit Conversion**: The API expects **Meters**. Manual calls must divide pixels by `50`.
- **Cleanup**: The plugin automatically removes bodies on `entity:destroy`. Do not try to manage Rapier handles manually unless you are bypassing the ECS.
- **CCD**: Continuous Collision Detection is expensive. Only enable it via `qualityPreset: 'high'` or for specific high-speed entities via `ccdEnabled: true`.
- **Layers**: Maximum 32 layers. Bitmasks are calculated as `1 << bit_index`.

