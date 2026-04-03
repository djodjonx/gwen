# Actors

Actors are the composable, instance-based alternative to systems. Where a system defines logic that runs for **every entity** matching a query, an actor encapsulates logic for **one specific entity** — its own data, lifecycle, and event reactions.

Think of actors as Unity `MonoBehaviour` components, but composable like Vue `setup()`.

## When to Use Actors vs Systems

| | Systems | Actors |
|---|---|---|
| Targets | All matching entities | One specific entity |
| Setup | Once at scene load | Once per spawn |
| Data ownership | ECS components | ECS components + local ref |
| Communication | Queries | Events + direct API |
| Best for | Physics, movement, rendering | Player, enemies, UI entities |

::: tip
Actors and systems are not exclusive. A `MovementSystem` can move all entities while a `PlayerActor` handles input and abilities for the player specifically.
:::

## `defineActor()`

```ts
import { defineActor, onStart, onDestroy, onEvent } from '@gwenjs/core/scene'
import { Position, Health } from './components'

export const EnemyActor = defineActor<{ x: number; y: number }>()(() => {
  // --- setup phase (runs once per spawn) ---

  const entityId = _getActorEntityId()

  onStart((api, props) => {
    api.addComponent(entityId, Position, { x: props.x, y: props.y })
    api.addComponent(entityId, Health, { current: 100, max: 100 })
  })

  onDestroy(() => {
    // cleanup, particle effects, etc.
  })

  onEvent('player:attack', (damage: number) => {
    const hp = Health.current[entityId]
    if (hp - damage <= 0) {
      emit('enemy:died', entityId)
    } else {
      Health.current[entityId] = hp - damage
    }
  })
})
```

`defineActor<Props>()` returns a factory. The inner function is the **setup factory** — it runs once per spawned instance and is where you register lifecycle hooks.

### Lifecycle hooks

| Hook | Called | Receives |
|---|---|---|
| `onStart(fn)` | After entity is created | `(api, props)` |
| `onDestroy(fn)` | Before entity is removed | `()` |
| `onEvent(name, fn)` | When `emit(name, ...)` is called | varies |

All hooks from `@gwenjs/core` (`onUpdate`, `onBeforeUpdate`, `onAfterUpdate`, `onRender`) are also available inside the actor factory.

## `useActor()` — Spawn and control actors

`useActor` is a composable called inside `defineSystem` or another actor's factory. It returns a handle for spawning and managing instances of a given actor.

```ts
import { defineSystem, onUpdate } from '@gwenjs/core'
import { useActor } from '@gwenjs/core/scene'
import { EnemyActor } from './enemy-actor'

export const SpawnerSystem = defineSystem(() => {
  const enemy = useActor(EnemyActor)

  onUpdate(() => {
    if (shouldSpawn()) {
      enemy.spawn({ x: Math.random() * 800, y: 0 })
    }
  })
})
```

### `ActorHandle` methods

| Method | Description |
|---|---|
| `spawn(props?)` | Create a new entity and run the actor factory |
| `despawn(entityId)` | Destroy the entity and run `onDestroy` |
| `spawnOnce(props?)` | Spawn only if no instance exists yet |
| `despawnAll()` | Destroy all living instances |
| `get(entityId)` | Return the public API of a specific instance |
| `getAll()` | Return the public APIs of all instances |
| `count()` | Number of living instances |

::: warning
`getAll()` allocates a new array on every call. Do not call it inside `onUpdate` — cache the result or use `count()` / `get()` instead.
:::

## `usePrefab()` — Spawn prefabs from a system

```ts
import { defineSystem, onUpdate } from '@gwenjs/core'
import { usePrefab } from '@gwenjs/core/scene'
import { BulletPrefab } from './prefabs'

export const WeaponSystem = defineSystem(() => {
  const bullet = usePrefab(BulletPrefab)

  onUpdate(() => {
    if (input.isJustDown('Space')) {
      bullet.spawn({ [Position]: { x: playerX, y: playerY } })
    }
  })
})
```

### `PrefabHandle` methods

| Method | Description |
|---|---|
| `spawn(overrides?)` | Instantiate the prefab with optional component overrides |
| `despawn(entityId)` | Destroy the spawned entity |

## `useComponent()` — Reactive component access

`useComponent` returns an ES6 Proxy bound to a specific entity. Read and write component fields directly — no manual `getComponent`/`addComponent` calls.

```ts
import { defineActor, onStart, onUpdate } from '@gwenjs/core/scene'
import { useComponent } from '@gwenjs/core/scene'
import { Position, Velocity } from './components'

export const PlayerActor = defineActor()(() => {
  const pos = useComponent(Position)
  const vel = useComponent(Velocity)

  onUpdate((dt) => {
    pos.x += vel.x * dt  // reads via getComponent()
    pos.y += vel.y * dt  // writes via addComponent()
  })
})
```

::: warning Performance note
`useComponent` creates the Proxy **once at spawn** — no per-frame overhead. However, each property **write** internally calls `addComponent`, which allocates one object. For hot paths with many writes per frame, prefer direct SoA access (`Position.x[entityId] += ...`) or batch updates with `engine.addComponent(entityId, def, { x, y })`.
:::

## `emit()` — Dispatch events

`emit` sends a named event to all listeners registered via `onEvent`, `engine.hooks.hook`, or `defineEvents`.

```ts
import { emit } from '@gwenjs/core'

// Inside an actor lifecycle callback
emit('enemy:died', entityId)
emit('player:damage', 25)
```

`emit` must be called within an active engine context (inside a system or actor callback).

## Typed Events with `defineEvents`

Declaring events centrally gives you full type-safety and IDE autocomplete across the entire codebase.

### 1. Declare your events

```ts
// src/events.ts
import { defineEvents } from '@gwenjs/core'
import type { InferEvents } from '@gwenjs/core'

export const GameEvents = defineEvents({
  'enemy:died':     (_id: bigint): void => undefined,
  'player:damage':  (_amount: number): void => undefined,
  'level:complete': (): void => undefined,
})

// Augment GwenRuntimeHooks once — enables type-checking everywhere
declare module '@gwenjs/core' {
  interface GwenRuntimeHooks extends InferEvents<typeof GameEvents> {}
}
```

### 2. Use typed `emit` and `onEvent`

```ts
// ✅ Fully typed — no casts, IDE autocomplete on name and args
emit('enemy:died', 42n)       // id: bigint ✅
emit('player:damage', 10)     // amount: number ✅
emit('unknown:event')         // ❌ TypeScript error — not declared
```

::: info
`GwenRuntimeHooks` is an augmentable interface. Engine-internal events (e.g., `engine:tick`, `entity:spawn`) are always typed. Your `defineEvents` declaration **extends** that set — existing hooks remain typed.
:::

## Full Example: Enemy Actor

```ts
// src/actors/enemy.ts
import { defineActor, onStart, onDestroy, onEvent, onUpdate } from '@gwenjs/core/scene'
import { useComponent } from '@gwenjs/core/scene'
import { emit } from '@gwenjs/core'
import { Position, Health, EnemyTag } from '../components'
import type { EcsApi } from '@gwenjs/core'

interface EnemyProps {
  x: number
  y: number
  maxHp?: number
}

export const EnemyActor = defineActor<EnemyProps>()(() => {
  const entityId = _getActorEntityId()
  const hp = useComponent(Health)

  onStart((api: EcsApi, { x, y, maxHp = 100 }) => {
    api.addComponent(entityId, Position, { x, y })
    api.addComponent(entityId, Health, { current: maxHp, max: maxHp })
    api.addComponent(entityId, EnemyTag, {})
  })

  onEvent('player:attack', (damage: number) => {
    if (hp.current - damage <= 0) {
      emit('enemy:died', entityId)
    } else {
      hp.current -= damage
    }
  })

  onDestroy(() => {
    emit('enemy:explode', entityId)
  })
})
```

```ts
// src/systems/spawner.ts
import { defineSystem, onUpdate } from '@gwenjs/core'
import { useActor } from '@gwenjs/core/scene'
import { EnemyActor } from '../actors/enemy'

export const SpawnerSystem = defineSystem(() => {
  const enemy = useActor(EnemyActor)
  let elapsed = 0

  onUpdate((dt) => {
    elapsed += dt
    if (elapsed > 2) {
      elapsed = 0
      enemy.spawn({ x: Math.random() * 800, y: -20 })
    }
  })
})
```

::: info Related
- [Systems](./systems.md) — frame-based logic over all matching entities
- [Prefabs](./prefabs.md) — reusable entity templates
- [Scenes](./scenes.md) — group systems and actors together
:::
