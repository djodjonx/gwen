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
