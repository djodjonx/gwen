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
defineConfig(config: GwenUserConfig): GwenConfig

// GwenUserConfig:
{
  modules?: (string | [string, options?])[]   // module names/tuples
  engine?: EngineOptions                       // maxEntities, targetFPS, …
  vite?: Record<string, unknown>               // extend Vite config
  hooks?: Partial<GwenBuildHooks>              // build lifecycle hooks
  plugins?: GwenPlugin[]                       // advanced: direct plugin registration
}
```

**Example:**

```ts
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  engine: { maxEntities: 10_000, targetFPS: 60 },
  modules: [
    '@gwenjs/input',
    ['@gwenjs/physics2d', { gravity: 9.81 }],
    ['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }],
  ],
})
```

::: info
`defineConfig` does not bootstrap the engine itself. The `gwen` CLI (or `@gwenjs/vite` plugin in dev mode) reads `gwen.config.ts` and calls `createEngine()` for you.
:::

---

## defineActor

**Import:** `@gwenjs/core/scene`

Create a composable actor — a reusable, instance-based entity controller. The setup factory runs once per spawned instance and is the place to register lifecycle hooks.

```ts
defineActor<Props = void, PublicAPI = void>(): (factory: () => PublicAPI | void) => ActorPlugin<Props, PublicAPI>
```

**Example:**

```ts
import { defineActor, onStart, onDestroy, onEvent } from '@gwenjs/core/scene'
import { Position, Health } from './components'

export const EnemyActor = defineActor<{ x: number; y: number }>()(() => {
  const entityId = _getActorEntityId()

  onStart((api, { x, y }) => {
    api.addComponent(entityId, Position, { x, y })
    api.addComponent(entityId, Health, { current: 100, max: 100 })
  })

  onDestroy(() => {
    emit('enemy:died', entityId)
  })
})
```

::: tip
Use `useActor(EnemyActor)` inside a system to get a spawn/despawn handle. See [Actors guide](../core/actors.md).
:::

---

## defineEvents

**Import:** `@gwenjs/core`

Declare a typed set of custom game events. Returns the same map at runtime (identity). Pair with `InferEvents` and `declare module` to augment `GwenRuntimeHooks` for full type-safety in `emit` and `onEvent`.

```ts
defineEvents<T extends EventHandlerMap>(map: T): T
```

**Example:**

```ts
import { defineEvents } from '@gwenjs/core'
import type { InferEvents } from '@gwenjs/core'

export const GameEvents = defineEvents({
  'enemy:died':     (_id: bigint): void => undefined,
  'player:damage':  (_amount: number): void => undefined,
  'level:complete': (): void => undefined,
})

declare module '@gwenjs/core' {
  interface GwenRuntimeHooks extends InferEvents<typeof GameEvents> {}
}
```

After augmentation, `emit('enemy:died', 42n)` is fully typed — wrong arg types and undeclared keys are compile errors.
