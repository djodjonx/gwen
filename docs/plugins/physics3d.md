# Physics 3D Plugin

**Package:** `@gwenjs/physics3d`
**Service key:** `physics3d` (`Physics3DAPI`)

3D rigid-body physics powered by [Rapier3D](https://rapier.rs/) compiled to WASM. Follows the same integration pattern as [`@gwenjs/physics2d`](/plugins/physics2d) — if you're familiar with that plugin, you already know most of this one.

## Install

```bash
gwen add @gwenjs/physics3d
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  modules: [
    ['@gwenjs/physics3d', {
      gravity: { x: 0, y: -9.81, z: 0 },
      qualityPreset: 'medium',
    }],
  ],
})
```

## Service API

The 3D API mirrors the 2D one. Key differences:

- All vectors are `{ x, y, z }` instead of `{ x, y }`.
- Collider shapes include `'sphere'`, `'box'`, `'cylinder'`, `'capsule'`, and `'trimesh'`.
- `gravity` is a `Vec3` object, not a scalar.

### Rigid bodies

| Method | Description |
|--------|-------------|
| `physics3d.createRigidBody(entityId, config)` | Create a 3D rigid body. Same `RigidBodyConfig` as 2D. |
| `physics3d.removeRigidBody(entityId)` | Destroy the rigid body. |
| `physics3d.setLinearVelocity(entityId, vec3)` | Set `{ x, y, z }` velocity. |
| `physics3d.getLinearVelocity(entityId)` | Returns `{ x, y, z }` velocity. |
| `physics3d.applyImpulse(entityId, vec3)` | Apply an instantaneous impulse. |
| `physics3d.applyForce(entityId, vec3)` | Apply a continuous force this frame. |
| `physics3d.setGravityScale(entityId, scale)` | Per-body gravity multiplier. |

### Collider shapes

```typescript
{ type: 'box';      halfExtents: { x: number; y: number; z: number } }
{ type: 'sphere';   radius: number }
{ type: 'capsule';  halfHeight: number; radius: number }
{ type: 'cylinder'; halfHeight: number; radius: number }
{ type: 'trimesh';  vertices: Float32Array; indices: Uint32Array }
```

### Collision events

Same event names as physics2d:

```typescript
useEvent('physics:collision', ({ entityA, entityB, type }) => { ... })
useEvent('physics:collision:batch', (events) => { ... })
```

### Composable

```typescript
import { usePhysics3D } from '@gwenjs/physics3d'

const physics3d = usePhysics3D() // shorthand for useService('physics3d')
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gravity` | `{ x, y, z }` | `{ x: 0, y: -9.81, z: 0 }` | Gravity vector (m/s²). |
| `qualityPreset` | `'low' \| 'medium' \| 'high' \| 'esport'` | `'medium'` | Solver iteration budget. See [Physics 2D presets](/plugins/physics2d#quality-presets). |
| `eventMode` | `'pull' \| 'hybrid'` | `'hybrid'` | Collision event delivery mode. |
| `coalesceEvents` | `boolean` | `true` | Merge repeated start/end pairs. |
| `ccdEnabled` | `boolean` | `false` | Continuous Collision Detection. |
| `maxEntities` | `number` | inherits `core.maxEntities` | Upper bound on physics bodies. |

## Example

```typescript
import { defineSystem, onUpdate } from '@gwenjs/core'
import { usePhysics3D } from '@gwenjs/physics3d'
import { useQuery } from '@gwenjs/core'
import { Position3D, RigidBody3D } from '../components'

export const physics3DSetupSystem = defineSystem(() => {
  const physics  = usePhysics3D()
  const entities = useQuery([Position3D, RigidBody3D])

  onUpdate(() => {
    for (const entity of entities.added) {
      physics.createRigidBody(entity.id, { type: 'dynamic', mass: 1 })
      physics.createCollider(entity.id,
        { type: 'sphere', radius: 0.5 },
        { friction: 0.4, restitution: 0.3 },
      )
    }

    for (const entity of entities.removed) {
      physics.removeRigidBody(entity.id)
    }
  })
})
```

## Related

- [Physics 2D](/plugins/physics2d) — 2D variant with full API reference
- [React Three Fiber](/plugins/r3f) — pair with R3F for 3D rendering
- [Debug Plugin](/plugins/debug) — visualise collider shapes at runtime
