# Helpers (define*)

`define*` helpers are pure factory functions — they do not execute side effects on their own. Pass the result to `engine.use()`, `defineConfig`, or a scene to activate it.

---

## defineComponent

**Import:** `@gwenjs/core`

Define an ECS component schema.

```ts
defineComponent(config: {
  name: string
  schema: Record<string, Type>
}): ComponentDef

// Factory form
defineComponent(name: string, factory: () => { schema: Record<string, Type> }): ComponentDef
```

Available types: `Types.f32`, `Types.i32`, `Types.bool`, `Types.vec2`, `Types.string`, `Types.entity`

**Example:**

```ts
import { defineComponent, Types } from '@gwenjs/core'

export const Position = defineComponent({
  name: 'Position',
  schema: { x: Types.f32, y: Types.f32 },
})

export const Health = defineComponent('Health', () => ({
  schema: { current: Types.i32, max: Types.i32 },
}))
```

---

## defineSystem

**Import:** `@gwenjs/core`

Create a composable system. The `setup` function runs **once, synchronously**, before the first frame. All composables (`useQuery`, lifecycle hooks, etc.) must be called inside it.

```ts
defineSystem(setup: () => void): GwenPlugin
```

**Example:**

```ts
import { defineSystem, useQuery, onUpdate } from '@gwenjs/core'
import { Position, Velocity } from './components'

export const movementSystem = defineSystem(() => {
  const entities = useQuery([Position, Velocity])

  onUpdate((dt) => {
    for (const e of entities) {
      Position.x[e] += Velocity.x[e] * dt
      Position.y[e] += Velocity.y[e] * dt
    }
  })
})
```

::: tip
`defineSystem` returns a `GwenPlugin` — register it with `engine.use(movementSystem)` or include it in a scene's `systems` array.
:::

---

## defineScene

**Import:** `@gwenjs/core`

Create a named scene with its own systems and optional UI.

```ts
defineScene(config: {
  name: string
  systems: GwenPlugin[]
  ui?: HTMLElement | (() => HTMLElement)
  onEnter?: (api: EcsApi) => void
  onExit?: (api: EcsApi) => void
}): SceneDef

// Factory form
defineScene(name: string, factory: () => SceneConfig): SceneDef
```

**Example:**

```ts
import { defineScene } from '@gwenjs/core'
import { movementSystem, renderSystem } from './systems'
import { spawnPlayer } from './prefabs'

export const gameScene = defineScene({
  name: 'game',
  systems: [movementSystem, renderSystem],
  onEnter(api) {
    api.instantiate(spawnPlayer)
  },
})
```

---

## definePrefab

**Import:** `@gwenjs/core`

Create a reusable entity template. Use `api.instantiate(prefab)` to spawn entities from it.

```ts
definePrefab(config: {
  name: string
  components: Array<{ def: ComponentDef; data: Record<string, unknown> }>
}): PrefabDef
```

**Example:**

```ts
import { definePrefab } from '@gwenjs/core'
import { Position, Health, PlayerTag } from './components'

export const playerPrefab = definePrefab({
  name: 'Player',
  components: [
    { def: Position, data: { x: 0, y: 0 } },
    { def: Health, data: { current: 100, max: 100 } },
    { def: PlayerTag, data: {} },
  ],
})
```

::: tip
Pass per-spawn overrides as the second argument to `api.instantiate(playerPrefab, { Position: { x: 50 } })`.
:::

---

## definePlugin

**Import:** `@gwenjs/kit`

Create a runtime plugin with lifecycle hooks. Plugins can provide services, register systems, and load WASM modules.

```ts
definePlugin(config: {
  name: string
  setup(engine: GwenEngine): void | Promise<void>
  teardown?(engine: GwenEngine): void
}): GwenPlugin
```

**Example:**

```ts
import { definePlugin } from '@gwenjs/kit'

export const analyticsPlugin = definePlugin({
  name: 'analytics',
  setup(engine) {
    engine.provide('analytics', new AnalyticsService())
  },
  teardown() {
    // flush any pending events
  },
})
```

---

## defineGwenModule

**Import:** `@gwenjs/kit`

Create a **build-time** module. Intended for library/module authors who need to hook into the GWEN build pipeline (Vite config, manifest injection, code generation).

```ts
defineGwenModule(config: {
  meta: { name: string }
  setup(options: unknown, kit: GwenKit): void
}): GwenModule
```

**Example:**

```ts
import { defineGwenModule } from '@gwenjs/kit'

export const myModule = defineGwenModule({
  meta: { name: 'my-module' },
  setup(options, kit) {
    kit.addVitePlugin(myVitePlugin(options))
  },
})
```

---

## defineConfig

**Import:** `@gwenjs/app`

Configure a GWEN project. This is the composition root read by the `gwen` CLI.

```ts
defineConfig(config: {
  core?: CoreOptions          // maxEntities, targetFPS, …
  wasm?: WasmPluginDef[]      // WASM adapters (physics2D, physics3D)
  plugins?: GwenPlugin[]      // runtime plugins
  modules?: GwenModule[]      // build-time modules
  hooks?: LifecycleHooks      // onReady, onError, …
}): GwenConfig
```

**Example:**

```ts
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'
import { physics2D } from '@gwenjs/physics2d'
import { InputPlugin } from '@gwenjs/input'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'

export default defineConfig({
  core: { maxEntities: 10_000, targetFPS: 60 },
  wasm: [physics2D({ gravity: 9.81 })],
  plugins: [
    new InputPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 }),
  ],
})
```

::: info
`defineConfig` does not bootstrap the engine itself. The `gwen` CLI (or `@gwenjs/vite` plugin in dev mode) reads `gwen.config.ts` and calls `createEngine()` for you.
:::
