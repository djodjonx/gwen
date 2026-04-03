# Layout API Reference

Layout functions enable declarative scene composition. They allow you to define the initial structure of a scene once and reuse it, with efficient bulk loading and disposal.

---

## defineLayout()

**Import:** `@gwenjs/core`

Create a layout definition from a factory function.

```ts
defineLayout<Refs extends Record<string, PlaceHandle<unknown>>>(
  factory: () => Refs
): LayoutDefinition<Refs>
```

The factory function runs once per `useLayout().load()` call. Inside the factory, you can call `placeActor()`, `placeGroup()`, and `placePrefab()` to compose the scene.

**Parameters:**

- `factory` — Synchronous function that returns an object mapping named handles.

**Returns:** A `LayoutDefinition` to pass to `useLayout()`.

::: tip
The factory is **not** called until `load()` is explicitly invoked. This enables lazy-loading strategies.
:::

**Example:**

```typescript
import { defineLayout, placeActor } from '@gwenjs/core'
import { PlayerActor } from './actors/player'
import { TileActor } from './actors/tile'

export const Level1 = defineLayout(() => {
  const player = placeActor(PlayerActor, { at: [100, 200] })
  
  const tiles = []
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      tiles.push(placeActor(TileActor, { at: [x * 32, y * 32] }))
    }
  }
  
  return { player, tiles }
})
```

---

## useLayout()

**Import:** `@gwenjs/core`

Load and manage a layout instance.

```ts
useLayout<Refs extends Record<string, PlaceHandle<unknown>>>(
  layoutDef: LayoutDefinition<Refs>,
  options?: UseLayoutOptions
): LayoutHandle<Refs>
```

Must be called inside an active engine context (e.g., `engine.run()`, a `defineSystem()` factory, or a plugin `setup()` callback).

**Parameters:**

- `layoutDef` — A `LayoutDefinition` from `defineLayout()`.
- `options.lazy` — If `true`, defer loading until `load()` is called. Default: `false` (auto-load).

**Returns:** A `LayoutHandle` with the following members:

### LayoutHandle

**Properties:**

- `refs: Refs` — Named references to placed entities. Defined after `load()` completes.
- `active: boolean` — Whether the layout is currently loaded.

**Methods:**

- `async load(): void` — Load the layout by executing the factory. Idempotent — safe to call multiple times.
- `async dispose(): void` — Destroy all entities owned by the layout via `bulk_destroy()`. Idempotent.

**Example:**

```typescript
import { defineSystem, useLayout } from '@gwenjs/core'
import { Level1 } from './layouts/level1'

export const levelSystem = defineSystem(() => {
  // Lazy-load the layout
  const level = useLayout(Level1, { lazy: true })
  
  onEnter(async () => {
    await level.load()
    console.log('Player entity ID:', level.refs.player.entityId)
    level.refs.player.api.startGame()
  })
  
  onEvent('reset', async () => {
    await level.dispose()
    await level.load()
  })
})
```

---

## placeActor()

**Import:** `@gwenjs/core`

Spawn an actor (an entity with system lifecycle) inside a layout.

```ts
placeActor<Props, API>(
  actorDef: ActorDefinition<Props, API>,
  options?: PlaceOptions<Props>
): PlaceHandle<API>
```

Must be called **inside a `defineLayout()` factory**.

**Parameters:**

- `actorDef` — An `ActorDefinition` from `defineActor()`.
- `options.at` — `[x, y]` world position. Default: `[0, 0]`.
- `options.props` — Actor props object. Passed to the actor's `defineActor()` factory.
- `options.parent` — Parent `PlaceHandle` for transform hierarchy.

**Returns:** A `PlaceHandle<API>` with:

- `entityId: bigint` — The entity's ID for advanced uses.
- `api: API` — The actor's public API returned by `defineActor()`.

::: warning
`placeActor()` throws an error if called outside a `defineLayout()` factory.
For runtime spawning, use `useActor().spawn()` instead.
:::

**Example:**

```typescript
const PlayerActor = defineActor(PlayerPrefab, () => {
  const t = useTransform()
  
  return {
    takeDamage: (amount: number) => { /* ... */ }
  }
})

const Level = defineLayout(() => {
  const player = placeActor(PlayerActor, {
    at: [100, 200],
    props: { hp: 100, level: 1 }
  })
  
  return { player }
})
```

---

## placeGroup()

**Import:** `@gwenjs/core`

Create a transform-only parent container without system logic.

```ts
placeGroup(
  factory: () => void,
  options?: PlaceOptions<unknown>
): PlaceHandle<{}>
```

Must be called **inside a `defineLayout()` factory**.

A group is a transform entity that can have children but no system. Useful for organizing hierarchies without overhead.

**Parameters:**

- `factory` — Function to place children. Child placements reference the group via `parent:`.
- `options.at` — `[x, y]` world position.
- `options.parent` — Parent `PlaceHandle` for nested hierarchies.

**Returns:** A `PlaceHandle` with `entityId` and empty `api`.

**Example:**

```typescript
const Level = defineLayout(() => {
  const worldGroup = placeGroup(() => {
    const player = placeActor(PlayerActor, { parent: ??? })
    const enemies = placeActor(EnemyActor, { parent: ??? })
  })
  
  return { worldGroup }
})
```

---

## placePrefab()

**Import:** `@gwenjs/core`

Spawn a prefab instance (an entity without system logic) inside a layout.

```ts
placePrefab<Props, API>(
  prefabDef: PrefabDefinition<Props, API>,
  options?: PlaceOptions<Props>
): PlaceHandle<API>
```

Must be called **inside a `defineLayout()` factory**.

Prefabs are simpler than actors — they have no system lifecycle, only component data and hooks.

**Parameters:**

- `prefabDef` — A `PrefabDefinition` from `definePrefab()`.
- `options.at` — `[x, y]` world position.
- `options.props` — Prefab props object.
- `options.parent` — Parent `PlaceHandle` for transform hierarchy.

**Returns:** A `PlaceHandle<API>` with `entityId` and `api`.

**Example:**

```typescript
const TilePrefab = definePrefab({
  components: [Transform, Sprite],
  props: (props: { variant: string }) => ({
    sprite: { sheet: 'tiles', frame: props.variant }
  })
})

const Level = defineLayout(() => {
  const tiles = []
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      tiles.push(
        placePrefab(TilePrefab, {
          at: [x * 32, y * 32],
          props: { variant: 'grass' }
        })
      )
    }
  }
  
  return { tiles }
})
```

---

## Transform Hierarchy

Both `placeActor()` and `placePrefab()` accept a `parent:` option to establish parent-child relationships.

```typescript
const parent = placeActor(ParentActor, { at: [400, 300] })
const child = placeActor(ChildActor, { 
  at: [10, 20],           // Position relative to parent
  parent: parent          // Parent reference
})
```

When the parent's transform changes, children follow automatically. The parent's local transform and children's local transforms combine to produce world transforms.

::: tip Transform Propagation
GWEN uses a dirty-flag algorithm in Rust. If the parent is stationary, child local transforms are not recomputed even if they're changed. Only moving parents trigger child recalculation.
:::

---

## useTransform()

**Import:** `@gwenjs/core`

Access transform manipulation and world reads for the current actor's entity.

```ts
useTransform(): TransformHandle
```

Must be called **synchronously inside a `defineActor()` factory** — not in systems or callbacks.

**Returns:** A `TransformHandle` with the following API:

### TransformHandle

**Write Methods:**

- `translate(dx: number, dy: number, dz?: number): void` — Move relative to current local position.
- `setPosition(x: number, y: number, z?: number): void` — Set absolute local position.
- `rotateTo(radians: number): void` — Set absolute local rotation (in radians).
- `rotate(delta: number): void` — Rotate relative to current local rotation.
- `scaleTo(sx: number, sy: number): void` — Set local scale.

**Read Properties:**

- `world: WorldTransform` — Read-only world-space transform.
  - `world.x: number` — World X position.
  - `world.y: number` — World Y position.
  - `world.z: number` — World Z position (always 0 in 2D).
  - `world.rotation: number` — World rotation (radians).
  - `world.scaleX: number` — World scale X.
  - `world.scaleY: number` — World scale Y.

- `hasParent: boolean` — Whether this entity has a parent.

**Parent Management:**

- `setParent(handle: PlaceHandle | { entityId: bigint }, keepWorldPos?: boolean): void` — Reparent to another entity.
- `detach(keepWorldPos?: boolean): void` — Detach from parent.

::: tip Performance
`.world` reads use lightweight WASM calls optimized for per-frame access.
For zero-copy SAB reads, use the SharedArrayBuffer transform regions directly
(see `@gwenjs/physics2d` for an example of this pattern).
:::

**Example:**

```typescript
import { defineActor, useTransform, onUpdate } from '@gwenjs/core'

const PlayerActor = defineActor(PlayerPrefab, () => {
  const t = useTransform()
  const input = useInput()
  
  onUpdate((dt) => {
    // Movement
    const moveX = input.axis('horizontal')
    const moveY = input.axis('vertical')
    t.translate(moveX * 100 * dt, moveY * 100 * dt)
    
    // Rotation towards cursor
    const worldPos = t.world
    const dx = input.mouseX() - worldPos.x
    const dy = input.mouseY() - worldPos.y
    const angle = Math.atan2(dy, dx)
    t.rotateTo(angle)
  })
  
  return {}
})
```

---

## Performance Tips

### Bulk Loading

Layouts implicitly use bulk spawning via the WASM bridge. Loading 200 tiles is **~0.05ms** vs **~0.8ms** with imperative per-entity spawning.

```typescript
const Level = defineLayout(() => {
  const tiles = []
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      // Bulk-spawned under the hood
      tiles.push(placeActor(TileActor, { at: [x * 32, y * 32] }))
    }
  }
  return { tiles }
})
```

### Bulk Disposal

`dispose()` uses `bulk_destroy()` to destroy all entities at once. Disposing 200 entities is **~0.02ms** vs **~0.4ms** with one-by-one deletion.

```typescript
const zone = useLayout(Level)
await zone.dispose()  // All 200 entities destroyed in 0.02ms
```

### World Reads are Lightweight

Access `.world` properties in hot paths — they use lightweight WASM calls:

```typescript
onRender(() => {
  const x = t.world.x      // Optimized: lightweight WASM call
  const y = t.world.y
  const rot = t.world.rotation
  // Use for minimap, debug overlay, etc.
})
```

### Dirty Flag Optimization

Child transforms are only recomputed when the parent is dirty (has changed). An RPG with 50 stationary NPCs and 2 moving NPCs eliminates **96% of transform recalculations**.

---

## Common Patterns

### Zone Transitions

```typescript
const zoneManager = defineSystem(() => {
  const town = useLayout(TownLayout, { lazy: true })
  const dungeon = useLayout(DungeonLayout, { lazy: true })
  
  onEvent('enter-dungeon', async () => {
    await town.dispose()
    await dungeon.load()
  })
  
  onEvent('exit-dungeon', async () => {
    await dungeon.dispose()
    await town.load()
  })
})
```

### Kart with Wheels

```typescript
const KartWithWheels = defineLayout(() => {
  const body = placeActor(KartActor, { at: [400, 300] })
  
  const wheels = {
    fl: placeActor(WheelActor, { at: [-20, -20], parent: body }),
    fr: placeActor(WheelActor, { at: [20, -20], parent: body }),
    bl: placeActor(WheelActor, { at: [-20, 20], parent: body }),
    br: placeActor(WheelActor, { at: [20, 20], parent: body }),
  }
  
  return { body, wheels }
})

// Wheels spin independently but move/rotate with the body
```

### UI Overlay

```typescript
const gameWithUI = defineSystem(() => {
  const world = useLayout(GameLevel)
  const ui = useLayout(HUDLayout)
  
  onEvent('pause', async () => {
    // Dispose only the game world, keep UI
    await world.dispose()
  })
  
  onEvent('unpause', async () => {
    await world.load()
  })
})
```
