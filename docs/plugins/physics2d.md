# Physics 2D Plugin

**Package:** `@gwenjs/physics2d`
**Service key:** `physics` (`Physics2DAPI`)

2D rigid-body physics powered by [Rapier2D](https://rapier.rs/) compiled to WASM. The physics world runs in a dedicated WASM module that shares `SharedArrayBuffer` memory with the engine core, keeping simulation data off the JS heap.

## Install

```bash
gwen add @gwenjs/physics2d
```

## Register

Add `@gwenjs/physics2d` to the `modules` array in `gwen.config.ts`:

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: [
    [
      '@gwenjs/physics2d',
      {
        gravity: 9.81,
        qualityPreset: 'medium',
        ccdEnabled: true,
      },
    ],
  ],
});
```

## Service API

### Rigid bodies

| Method                                      | Description                          |
| ------------------------------------------- | ------------------------------------ |
| `physics.createRigidBody(entityId, config)` | Create a rigid body for an entity.   |
| `physics.removeRigidBody(entityId)`         | Destroy the rigid body.              |
| `physics.setLinearVelocity(entityId, vec)`  | Set velocity directly (`{ x, y }`).  |
| `physics.getLinearVelocity(entityId)`       | Returns current `{ x, y }` velocity. |
| `physics.applyImpulse(entityId, vec)`       | Apply an instantaneous impulse.      |
| `physics.applyForce(entityId, vec)`         | Apply a continuous force this frame. |
| `physics.setGravityScale(entityId, scale)`  | Per-body gravity multiplier.         |

`config` shape:

```typescript
interface RigidBodyConfig {
  type: 'dynamic' | 'kinematic' | 'fixed';
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  lockRotation?: boolean;
}
```

### Colliders

| Method                                             | Description                                  |
| -------------------------------------------------- | -------------------------------------------- |
| `physics.createCollider(entityId, shape, config?)` | Attach a collider to an entity's rigid body. |
| `physics.removeCollider(entityId)`                 | Remove the collider.                         |

`shape` is one of:

```typescript
{
  type: 'box';
  width: number;
  height: number;
}
{
  type: 'circle';
  radius: number;
}
{
  type: 'capsule';
  halfHeight: number;
  radius: number;
}
{
  type: 'polygon';
  vertices: Array<{ x: number; y: number }>;
}
```

`config` shape:

```typescript
interface ColliderConfig {
  friction?: number; // 0–1
  restitution?: number; // 0–1 (bounciness)
  sensor?: boolean; // trigger-only, no physical response
  categoryBits?: number;
  maskBits?: number;
}
```

### Collision events

Subscribe inside `defineSystem` using GWEN's event bus:

```typescript
import { useEvent } from '@gwenjs/core'

useEvent('physics:collision', ({ entityA, entityB, type }) => {
  // type: 'start' | 'end'
})

// Batched events (delivered once per frame, sorted)
useEvent('physics:collision:batch', (events) => {
  for (const evt of events) { ... }
})
```

### Composable

```typescript
import { usePhysics2D } from '@gwenjs/physics2d';

const physics = usePhysics2D(); // shorthand for useService('physics')
```

## Options

| Option           | Type                                      | Default                     | Description                                                     |
| ---------------- | ----------------------------------------- | --------------------------- | --------------------------------------------------------------- |
| `gravity`        | `number`                                  | `-9.81`                     | Vertical gravity (m/s²). Negative = downward.                   |
| `gravityX`       | `number`                                  | `0`                         | Horizontal gravity component.                                   |
| `qualityPreset`  | `'low' \| 'medium' \| 'high' \| 'esport'` | `'medium'`                  | Solver iteration budget. `'esport'` maximises accuracy.         |
| `eventMode`      | `'pull' \| 'hybrid'`                      | `'hybrid'`                  | How collision events are delivered. `'pull'` is lower-overhead. |
| `coalesceEvents` | `boolean`                                 | `true`                      | Merge repeated start/end events for the same pair into one.     |
| `ccdEnabled`     | `boolean`                                 | `false`                     | Continuous Collision Detection for fast-moving bodies.          |
| `maxEntities`    | `number`                                  | inherits `core.maxEntities` | Upper bound on physics bodies.                                  |

### Quality presets

| Preset   | Solver iterations | Use case                                              |
| -------- | ----------------- | ----------------------------------------------------- |
| `low`    | 2                 | Mobile, background simulation                         |
| `medium` | 4                 | General games                                         |
| `high`   | 8                 | Precision platformers, puzzles                        |
| `esport` | 16                | Competitive games where physics must be deterministic |

## Example

```typescript
import { defineSystem, useService, onUpdate } from '@gwenjs/core';
import { usePhysics2D } from '@gwenjs/physics2d';
import { useEvent } from '@gwenjs/core';
import { Position, RigidBody } from '../components';

export const physicsSetupSystem = defineSystem(() => {
  const physics = usePhysics2D();
  const entities = useQuery([Position, RigidBody]);

  // Spawn rigid bodies when entities are created
  onUpdate(() => {
    for (const entity of entities.added) {
      physics.createRigidBody(entity.id, { type: 'dynamic', mass: 1 });
      physics.createCollider(
        entity.id,
        { type: 'box', width: 32, height: 32 },
        {
          friction: 0.5,
          restitution: 0.2,
        },
      );
    }
    for (const entity of entities.removed) {
      physics.removeRigidBody(entity.id);
    }
  });

  // Listen for collisions
  useEvent('physics:collision', ({ entityA, entityB, type }) => {
    if (type === 'start') {
      console.log(`${entityA} hit ${entityB}`);
    }
  });
});
```

## Related

- [Physics 3D](/plugins/physics3d) — same pattern for 3D
- [Debug Plugin](/plugins/debug) — visualise collider shapes at runtime
- [Canvas2D Renderer](/plugins/renderer-canvas2d) — pair with the renderer to draw physics-driven sprites
