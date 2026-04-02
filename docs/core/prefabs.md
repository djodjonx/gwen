# Prefabs

Prefabs are reusable entity templates. Define a component layout once with default values, then stamp out as many instances as you need — each with optional per-instance overrides.

## What Are Prefabs?

Creating a complex entity manually — `createEntity()`, then one `addComponent()` call per component — is repetitive and error-prone. Prefabs solve this by capturing the full component blueprint in one place.

::: tip
Always prefer `definePrefab` + `api.instantiate()` over manual entity construction for anything with more than one or two components.
:::

## `definePrefab()`

```ts
import { definePrefab } from '@gwenjs/core'
import { Position, Velocity, Sprite, BulletTag } from './components'

export const BulletPrefab = definePrefab({
  name: 'Bullet',
  components: [
    [Position, { x: 0, y: 0 }],
    [Velocity, { x: 0, y: -600 }],
    [Sprite,   { texture: 'bullet.png', width: 4, height: 12 }],
    [BulletTag, {}],
  ],
})
```

Each entry is a tuple of `[ComponentDefinition, defaultData]`. These defaults are used whenever a field is not overridden at instantiation time.

## Instantiating Prefabs

Call `api.instantiate(prefab, overrides?)` to spawn a new entity from a prefab. It returns the new entity ID.

```ts
// Spawn with all defaults
const id = api.instantiate(BulletPrefab)

// Spawn with position override (all other components use defaults)
const id = api.instantiate(BulletPrefab, {
  [Position]: { x: playerX, y: playerY },
})
```

Overrides are **shallow-merged** per component — you only need to provide the fields you want to change.

## Overriding Values

You can override any subset of components declared in the prefab:

```ts
api.instantiate(BulletPrefab, {
  [Position]: { x: 200, y: 300 },
  [Velocity]: { x: 0, y: -900 },  // faster bullet
})
```

Components not listed in the overrides object use their prefab defaults unchanged.

::: info
Overrides do not add new components. You can only override components that are already declared in the prefab definition.
:::

## Prefabs vs Manual Creation

| | Prefab | Manual |
|---|---|---|
| Reusability | ✅ Define once | ❌ Repeat everywhere |
| Default values | ✅ Centralized | ❌ Scattered |
| Per-instance overrides | ✅ Ergonomic | ⚠️ Verbose |
| Readability | ✅ Clear intent | ❌ Boilerplate |

```ts
// ❌ Manual — verbose and easy to forget a component
const id = api.createEntity()
api.addComponent(id, Position, { x: 200, y: 300 })
api.addComponent(id, Velocity, { x: 0, y: -600 })
api.addComponent(id, Sprite,   { texture: 'bullet.png', width: 4, height: 12 })
api.addComponent(id, BulletTag, {})

// ✅ Prefab — expressive and DRY
const id = api.instantiate(BulletPrefab, { [Position]: { x: 200, y: 300 } })
```
