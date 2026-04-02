# Common Patterns

A quick-reference guide to the patterns you'll use most often in GWEN. Each entry includes a short explanation and a minimal code snippet.

---

## 1. Entity Spawning with a Prefab

`api.instantiate(prefab, overrides)` creates an entity from a template. Overrides are shallow-merged per component — only the fields you supply are changed.

```typescript
import { PlayerPrefab } from '../prefabs'
import { Position } from '../components'

// Spawn at a specific position; all other component values stay at their prefab defaults
api.instantiate(PlayerPrefab, {
  [Position]: { x: 100, y: 200 },
})
```

See [Prefabs](/core/prefabs) for the full override signature.

---

## 2. One-Shot Query vs Live Query

Use `api.query([...])` for a single snapshot — for example, to find all enemies when a scene loads. Use `useQuery([...])` inside `defineSystem` for a live set that stays in sync as entities are created and destroyed.

```typescript
// One-shot — fine for onEnter, event handlers, etc.
const enemies = api.query([Position, EnemyTag])

// Live query — use inside defineSystem; reflects current ECS state at each iteration
const movables = useQuery([Position, Velocity])
```

---

## 3. Conditional System Logic

Tag components let you filter entities without touching data. Compose them in a query to target only the entities you care about.

```typescript
// Only process entities that have both Velocity AND EnemyTag
const enemies = useQuery([Velocity, EnemyTag])

onUpdate((dt) => {
  for (const e of enemies) {
    // guaranteed to be an enemy — no instanceof check needed
    e.get(Velocity).y += 20 * dt   // accelerate downward
  }
})
```

---

## 4. Scene Transition

Call `api.loadScene(scene)` from anywhere a GWEN `api` handle is in scope — system callbacks, event handlers, or `onEnter`.

```typescript
import { defineSystem, onEvent } from '@gwenjs/core'
import { GameOverScene } from '../scenes/game-over'

export const deathSystem = defineSystem((api) => {
  onEvent('player:died', () => {
    api.loadScene(GameOverScene)
  })
})
```

The current scene is torn down (systems unregistered, entities destroyed) before the new scene's `onEnter` runs. See [Scenes](/core/scenes).

---

## 5. Accessing a Service from a System

Call `useService(name)` during the synchronous setup phase of `defineSystem`. After `gwen prepare` is run, the return type is inferred automatically from your config — no casting needed.

```typescript
import { defineSystem } from '@gwenjs/core'
import { usePhysics2D } from '@gwenjs/physics2d'

export const gravitySystem = defineSystem(() => {
  // Resolved once at setup — not called every frame
  const physics = usePhysics2D()

  physics.onCollision((a, b) => { /* ... */ })
})
```

::: tip usePhysics2D is a typed shorthand
`usePhysics2D()` is equivalent to `useService('physics2d')` but returns a fully typed `Physics2DAPI` without any extra setup. Named shortcuts exist for all official plugins.
:::

---

## 6. Input-Driven Movement

Resolve `useInput()` once in setup; read `keyboard.isDown()` inside `onUpdate` every frame.

```typescript
import { defineSystem, useQuery, onUpdate } from '@gwenjs/core'
import { useInput } from '@gwenjs/input'
import { Position, Velocity, PlayerTag } from '../components'

export const playerMoveSystem = defineSystem(() => {
  const { keyboard } = useInput()
  const players = useQuery([Position, Velocity, PlayerTag])

  onUpdate((dt) => {
    for (const e of players) {
      const vel = e.get(Velocity)
      vel.x  = (keyboard.isDown('ArrowRight') ? 300 : 0)
              - (keyboard.isDown('ArrowLeft')  ? 300 : 0)
    }
  })
})
```

See [Input Plugin](/plugins/input) for the full key and gamepad API.

---

## 7. Grouping Entities by Tag

Define a zero-schema component as a marker. GWEN's ECS resolves tag queries in WASM — there is no overhead for iterating unrelated archetypes.

```typescript
// Define once
export const EnemyTag  = defineComponent({ name: 'EnemyTag',  schema: {} })
export const PlayerTag = defineComponent({ name: 'PlayerTag', schema: {} })

// Query only enemies — no runtime type checking
const enemies = useQuery([Position, EnemyTag])
```

Tag components are also useful for enabling/disabling behaviour at runtime: add or remove a tag to change which queries an entity matches.

---

## 8. Plugin Composition

A plugin can register sub-plugins inside its own `setup()`. This is the standard way to bundle related capabilities.

```typescript
import { definePlugin } from '@gwenjs/core'
import { InputPlugin } from '@gwenjs/input'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'

export const gamePlugin = definePlugin({
  name: 'GamePlugin',
  setup(engine) {
    // Register dependencies — order is preserved
    engine.use(new InputPlugin())
    engine.use(new Canvas2DRenderer({ width: 800, height: 600 }))

    // Then register this plugin's own systems...
  },
})
```

See [Plugin System](/plugins/index) for lifecycle hooks and dependency ordering.

---

## 9. Debug-Only Plugin

Only register `@gwenjs/debug` in development builds. Vite strips the dead branch in production.

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  modules: [
    // ...other modules

    // Zero cost in production — tree-shaken away
    ...(import.meta.env.DEV ? ['@gwenjs/debug'] : []),
  ],
})
```

::: info
`import.meta.env.DEV` is a Vite constant. The GWEN Vite plugin ensures it is correctly replaced at build time.
:::

---

## 10. gwen prepare + Zero-Cast Service Types

After running `pnpm gwen prepare`, GWEN generates `.gwen/services.d.ts` which extends `GwenDefaultServices`. From then on, `useService('physics2d')` returns the precise plugin API type — no `as` cast, no manual import.

```typescript
// Before gwen prepare → useService returns `unknown`
const physics = useService('physics2d') as Physics2DAPI  // ❌ manual cast

// After gwen prepare → inferred automatically
const physics = useService('physics2d')                  // ✅ Physics2DAPI
physics.onCollision(...)                                 // fully typed
```

Run `gwen prepare` once after scaffolding, and again whenever you add or remove a plugin.

```sh
pnpm gwen prepare
```

See [CLI Reference](/cli/overview) and [Zero-Cast Types](/guide/quick-start#run-gwen-prepare) for more detail.

---

**Related pages**

- [ECS Concepts](/core/components)
- [Systems & Composables](/core/systems)
- [Prefabs](/core/prefabs)
- [Scenes](/core/scenes)
- [Input Plugin](/plugins/input)
- [Physics 2D Plugin](/plugins/physics2d)
- [Space Shooter Walkthrough](./space-shooter)
