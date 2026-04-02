# Composable Systems

## `createPhysicsKinematicSyncSystem(options?)`

Factory exported by the plugin to sync ECS positions to Rapier for kinematic bodies.

```ts
import { createPhysicsKinematicSyncSystem } from '@gwenjs/physics2d';

const PhysicsKinematicSyncSystem = createPhysicsKinematicSyncSystem();

export const GameScene = defineScene('Game', () => ({
  systems: [PlayerSystem, MovementSystem, PhysicsKinematicSyncSystem],
}));
```

### Options

```ts
interface PhysicsKinematicSyncSystemOptions {
  pixelsPerMeter?: number; // default 50
  positionComponent?: string; // default 'position'
}
```

## When to use it

Use it when:

- your physics entities are `kinematic`
- your position source of truth is ECS (`position` component)

Not needed when:

- bodies are purely `dynamic` and you handle physics -> ECS elsewhere

## Recommended system order

Recommended:

1. Input/AI
2. ECS movement system (writes `position`)
3. `createPhysicsKinematicSyncSystem()`
4. Spawner / other systems

Then the physics plugin runs `step` and dispatches collisions.

## Performance notes

This system is intentionally minimal:

- query entities with the position component
- convert pixels -> meters
- call `setKinematicPosition` per entity

For very large entity counts, optimize upstream (dirty flags, partitioning, off-screen freeze).
