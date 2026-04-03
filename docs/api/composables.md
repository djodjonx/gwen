# Composables (use*)

Composables provide reactive access to engine state from inside systems. They must be called **synchronously** during the `defineSystem()` setup function — not inside callbacks.

```ts
// ✅ Correct — called during setup
const system = defineSystem(() => {
  const query = useQuery([Position])  // resolved once at setup
  onUpdate((dt) => { /* use query here */ })
})

// ❌ Wrong — called inside a callback
const system = defineSystem(() => {
  onUpdate((dt) => {
    const query = useQuery([Position])  // throws GwenContextError
  })
})
```

::: warning GwenContextError
Calling any composable outside a `defineSystem()` setup context throws `GwenContextError`. This includes calling them at module scope or inside async functions.
:::

---

## useEngine()

**Import:** `@gwenjs/core`

Returns the active `GwenEngine` instance.

```ts
useEngine(): GwenEngine
```

Most developers use higher-level composables (`useQuery`, `useService`) instead. Reach for `useEngine()` only when direct engine access is needed.

**Example:**

```ts
const system = defineSystem(() => {
  const engine = useEngine()
  onUpdate(() => {
    if (shouldStop) engine.stop()
  })
})
```

---

## useQuery(components)

**Import:** `@gwenjs/core`

Subscribe to a live entity query. The returned set auto-updates as entities gain or lose the queried components — no manual refresh needed.

```ts
useQuery(components: ComponentDef[]): LiveQuery
```

Iterate with `for...of`. Indices are stable `EntityId` values.

**Example:**

```ts
import { defineSystem, useQuery, onUpdate } from '@gwenjs/core'
import { Position, Velocity } from './components'

export const movementSystem = defineSystem(() => {
  const movers = useQuery([Position, Velocity])

  onUpdate((dt) => {
    for (const e of movers) {
      Position.x[e] += Velocity.x[e] * dt
      Position.y[e] += Velocity.y[e] * dt
    }
  })
})
```

::: tip
For one-shot queries outside a system (e.g., in scene `onEnter`), use [`api.query()`](./engine#ecs-methods) instead.
:::

---

## useService(name)

**Import:** `@gwenjs/core`

Inject a service provided by a plugin. After running `gwen prepare`, the return type is inferred from `GwenDefaultServices` — no casting required.

```ts
useService<K extends keyof GwenDefaultServices>(name: K): GwenDefaultServices[K]
```

**Example:**

```ts
import { defineSystem, useService, onUpdate } from '@gwenjs/core'

export const jumpSystem = defineSystem(() => {
  const physics = useService('physics')  // typed as Physics2DAPI after gwen prepare

  onUpdate(() => {
    physics.applyImpulse(playerId, { x: 0, y: -500 })
  })
})
```

::: info Type generation
Run `gwen prepare` (or keep `pnpm dev` running) to regenerate `GwenDefaultServices`. Never cast the return value manually.
:::

---

## useWasmModule(name)

**Import:** `@gwenjs/core`

Access a WASM module handle previously loaded with `engine.loadWasmModule()`.

```ts
useWasmModule(name: string): WasmModuleHandle
```

Use `handle.region(name)` and `handle.channel(name)` to access shared memory and ring-buffer channels. See [Engine API — WASM modules](./engine#wasm-modules).

**Example:**

```ts
const system = defineSystem(() => {
  const wasmHandle = useWasmModule('my-physics')

  onUpdate(() => {
    const transforms = wasmHandle.region('transforms')
    // read/write zero-copy via TypedArray view
  })
})
```

---

## onUpdate(fn)

**Import:** `@gwenjs/core`

Register a callback for the **main update phase**, called once per frame.

```ts
onUpdate(fn: (dt: number) => void): void
```

`dt` is delta time in **seconds** since the last frame.

**Example:**

```ts
onUpdate((dt) => {
  for (const e of enemies) {
    Position.x[e] += Speed.value[e] * dt
  }
})
```

---

## onBeforeUpdate(fn)

**Import:** `@gwenjs/core`

Register a callback that runs **before** the physics/WASM step each frame. Use this to write input state or intent into shared buffers before physics resolves.

```ts
onBeforeUpdate(fn: (dt: number) => void): void
```

---

## onAfterUpdate(fn)

**Import:** `@gwenjs/core`

Register a callback that runs **after** the physics/WASM step each frame. Use this to read physics results back into ECS components.

```ts
onAfterUpdate(fn: (dt: number) => void): void
```

---

## onRender(fn)

**Import:** `@gwenjs/core`

Register a callback for the **render phase**. Called after all update phases. No `dt` argument — render is decoupled from simulation time.

```ts
onRender(fn: () => void): void
```

**Example:**

```ts
onRender(() => {
  for (const e of renderables) {
    ctx.drawImage(Sprite.image[e], Position.x[e], Position.y[e])
  }
})
```

---

## Frame phase order

Each frame executes phases in this order:

1. `onBeforeUpdate` — input / intent writing
2. WASM step (physics, custom modules)
3. `onUpdate` — main game logic
4. `onAfterUpdate` — read-back from WASM
5. `onRender` — draw

---

## useActor(actorDef)

**Import:** `@gwenjs/core/scene`

Return a spawn/despawn handle for a given actor definition. Must be called inside a `defineSystem` or `defineActor` setup factory.

```ts
useActor<Props, PublicAPI>(actorDef: ActorPlugin<Props, PublicAPI>): ActorHandle<Props, PublicAPI>
```

**Example:**

```ts
import { defineSystem, onUpdate } from '@gwenjs/core'
import { useActor } from '@gwenjs/core/scene'
import { EnemyActor } from './actors/enemy'

export const SpawnerSystem = defineSystem(() => {
  const enemy = useActor(EnemyActor)

  onUpdate(() => {
    if (shouldSpawn()) {
      enemy.spawn({ x: Math.random() * 800, y: -20 })
    }
  })
})
```

| Method | Description |
|---|---|
| `spawn(props?)` | Create entity + run actor factory |
| `despawn(id)` | Destroy entity + run `onDestroy` |
| `spawnOnce(props?)` | Spawn only if count is 0 |
| `despawnAll()` | Destroy all living instances |
| `get(id)` | Public API of one instance |
| `getAll()` | Array of all public APIs (allocates — avoid in hot loops) |
| `count()` | Number of living instances |

---

## usePrefab(prefabDef)

**Import:** `@gwenjs/core/scene`

Return a spawn/despawn handle for a prefab. Useful when you need to spawn prefabs dynamically from inside a system without needing per-instance lifecycle hooks.

```ts
usePrefab(prefabDef: PrefabDefinition): PrefabHandle
```

**Example:**

```ts
import { defineSystem, onUpdate } from '@gwenjs/core'
import { usePrefab } from '@gwenjs/core/scene'
import { BulletPrefab } from './prefabs'

export const WeaponSystem = defineSystem(() => {
  const bullet = usePrefab(BulletPrefab)

  onUpdate(() => {
    if (firing) bullet.spawn({ [Position]: { x: px, y: py } })
  })
})
```

---

## useComponent(componentDef)

**Import:** `@gwenjs/core/scene`

Return an ES6 Proxy bound to the current actor's entity. Read and write component fields directly without manual `getComponent`/`addComponent` calls. Must be called inside a `defineActor` factory — the entity ID is captured at spawn time.

```ts
useComponent<T>(def: ComponentDef<T>): T
```

**Example:**

```ts
import { defineActor, onUpdate } from '@gwenjs/core/scene'
import { useComponent } from '@gwenjs/core/scene'
import { Position, Velocity } from './components'

export const PhysicsActor = defineActor()(() => {
  const pos = useComponent(Position)   // proxy bound to this entity
  const vel = useComponent(Velocity)

  onUpdate((dt) => {
    pos.x += vel.x * dt  // reads getComponent, writes addComponent
    pos.y += vel.y * dt
  })
})
```

::: warning
Each property **write** allocates one object (ECS component model is immutable). Batch writes using `engine.addComponent(id, def, { x, y })` directly for hot paths with many updates per frame.
:::

---

## emit(name, ...args)

**Import:** `@gwenjs/core`

Dispatch a named event to all listeners registered via `onEvent`, `engine.hooks.hook`, or `defineEvents`. Must be called within an active engine context.

```ts
// For known GwenRuntimeHooks keys — fully typed
emit<K extends keyof GwenRuntimeHooks>(name: K, ...args: Parameters<GwenRuntimeHooks[K]>): void
// For custom events — accepts any string
emit(name: string, ...args: unknown[]): void
```

**Example:**

```ts
import { emit } from '@gwenjs/core'

emit('enemy:died', entityId)    // custom event — no cast needed
emit('player:damage', 25)       // custom event
emit('engine:tick', 0.016)      // built-in hook — args type-checked
```

::: tip
Use [`defineEvents`](./helpers.md#defineevents) to declare your game events once and get full type-safety (wrong arg types and undeclared keys become compile errors).
:::

---

## onStart(fn)

**Import:** `@gwenjs/core/scene` · Only valid inside `defineActor`

Register a callback to run after the entity is created and components are ready.

```ts
onStart(fn: (api: EcsApi, props: Props) => void): void
```

---

## onDestroy(fn)

**Import:** `@gwenjs/core/scene` · Only valid inside `defineActor`

Register a callback to run just before the entity is removed.

```ts
onDestroy(fn: () => void): void
```

---

## onEvent(name, fn)

**Import:** `@gwenjs/core/scene` · Only valid inside `defineActor`

Register a callback to run when `emit(name, ...)` is called while this actor instance is alive. The listener is automatically removed when the actor is despawned.

```ts
onEvent<K extends keyof GwenRuntimeHooks>(name: K, fn: GwenRuntimeHooks[K]): void
onEvent(name: string, fn: (...args: unknown[]) => void): void
```

**Example:**

```ts
onEvent('player:attack', (damage: number) => {
  hp.current -= damage
  if (hp.current <= 0) emit('enemy:died', entityId)
})
