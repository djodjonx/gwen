# Systems

Systems are where game logic lives. A system queries entities by their components and runs callbacks each frame to read and mutate data.

## What Are Systems?

A system is a function that runs on a set of matching entities each frame. Systems are the only place where component data should change — components are inert data, systems are the logic.

GWEN uses a **composable pattern**: you declare what a system needs (queries, services, input) once during setup, then use those resolved references in frame callbacks.

## `defineSystem()`

`defineSystem()` takes a setup function. The setup function runs **once**, synchronously, when the scene containing the system is entered. Composables are resolved here. Frame callbacks (`onUpdate`, etc.) are registered here.

```ts
import { defineSystem, useQuery, onUpdate } from '@gwenjs/core'
import { Position, Velocity } from './components'

export const MovementSystem = defineSystem(() => {
  // Setup phase — runs once
  const entities = useQuery([Position, Velocity])

  // Frame callback — runs every frame
  onUpdate((dt) => {
    for (const id of entities) {
      const pos = api.getComponent(id, Position)
      const vel = api.getComponent(id, Velocity)
      pos.x += vel.x * dt
      pos.y += vel.y * dt
    }
  })
})
```

::: tip
The setup function is the right place to call all composables. Do not call `useQuery()` or `useService()` inside `onUpdate` — the [engine context](./context.md) may not be active there.
:::

## Lifecycle Hooks

Register callbacks for any of GWEN's frame phases from inside setup:

| Hook | When it runs | Typical use |
|---|---|---|
| `onBeforeUpdate(dt)` | Phase 1 — before physics | Input sampling, pre-simulation state |
| `onUpdate(dt)` | Phase 3 — main logic | Movement, AI, game rules |
| `onAfterUpdate(dt)` | Phase 5 — post-physics | Collision response, cameras |
| `onRender()` | Phase 7 — render | Drawing, UI sync |

A single system can register multiple hooks:

```ts
export const CameraSystem = defineSystem(() => {
  const entities = useQuery([Position, CameraTag])

  onAfterUpdate((dt) => {
    // sync camera position after physics has settled
  })

  onRender(() => {
    // apply camera transform to renderer
  })
})
```

## Querying Entities

`useQuery([...components])` returns a **live `LiveQuery`** — an iterable that always reflects the current set of entities carrying all listed components. As entities gain or lose components, the query updates automatically.

```ts
const enemies = useQuery([Position, EnemyTag, Health])

onUpdate((dt) => {
  for (const id of enemies) {
    // every entity with Position + EnemyTag + Health
  }
})
```

::: info Performance
Queries are O(1) to iterate. The ECS archetype system in the WASM core keeps them up to date with no per-frame scanning.
:::

## Accessing Services

Use `useService('name')` inside setup to get a reference to a plugin-provided service API:

```ts
import { defineSystem, useService, useQuery, onUpdate } from '@gwenjs/core'

export const PhysicsDebugSystem = defineSystem(() => {
  const physics = useService('physics')
  const bodies = useQuery([RigidBody])

  onUpdate((dt) => {
    for (const id of bodies) {
      physics.applyForce(id, { x: 0, y: -9.81 })
    }
  })
})
```

::: tip Auto-typed services
After running `gwen prepare`, service types are generated into `GwenDefaultServices`. `useService('physics')` returns the correct `Physics2DAPI` type without any manual casting.
:::

## Registering Systems

Systems are associated with [scenes](./scenes.md). Add them to the `systems` array in `defineScene()`:

```ts
import { defineScene } from '@gwenjs/core'
import { MovementSystem, PhysicsDebugSystem } from './systems'

export const GameScene = defineScene({
  name: 'Game',
  systems: [MovementSystem, PhysicsDebugSystem],
})
```

Systems are started when the scene is entered and stopped when it exits.
