# Components

Components are the data layer of GWEN's ECS. They describe what an entity _is_ — not what it does. All logic lives in [systems](./systems.md).

## What Are Components?

A component is a typed, flat data container attached to an entity. It has no methods, no behaviour — just fields. GWEN stores component data in Structure-of-Arrays layout inside WASM linear memory for cache-efficient access.

## `defineComponent()`

Use `defineComponent()` to declare a component with a typed schema:

```ts
import { defineComponent, Types } from '@gwenjs/core';

export const Position = defineComponent({
  name: 'Position',
  schema: {
    x: Types.f32,
    y: Types.f32,
  },
});

export const PlayerTag = defineComponent({
  name: 'PlayerTag',
  schema: {}, // tag component — no fields
});
```

Components can also be defined as factories when you need a more dynamic schema:

```ts
export const Health = defineComponent(() => ({
  name: 'Health',
  schema: {
    current: Types.f32,
    max: Types.f32,
    invincible: Types.bool,
  },
}));
```

## Schema Types

| Type           | JS equivalent | Use for                         |
| -------------- | ------------- | ------------------------------- |
| `Types.f32`    | `number`      | Positions, velocities, angles   |
| `Types.i32`    | `number`      | Counts, indices, flags          |
| `Types.bool`   | `boolean`     | On/off state                    |
| `Types.vec2`   | `{ x, y }`    | 2D vectors                      |
| `Types.string` | `string`      | Names, keys (avoid in hot path) |

::: tip
Prefer `Types.f32` for most numeric values. Use `Types.i32` for integer counters or entity IDs stored as component data. Avoid `Types.string` in components that are read every frame.
:::

## Reading & Writing

Use the `api` object (available in system setup via `useEngine().api` or passed to scene hooks) to manipulate component data:

```ts
// Add a component to an entity
api.addComponent(entityId, Position, { x: 0, y: 0 })

// Read component data
const pos = api.getComponent(entityId, Position)
// pos.x, pos.y

// Mutate in place
pos.x += 10

// Check presence
if (api.hasComponent(entityId, Velocity)) { ... }

// Remove a component
api.removeComponent(entityId, Velocity)
```

::: info Live references
`getComponent()` returns a **live reference** into the WASM buffer. You do not need to call a setter after mutating fields — changes are reflected immediately.
:::

## Best Practices

- **One concept per component.** `Position` and `Velocity` should be separate, not combined into `Transform`.
- **No methods.** Components are data. Put logic in systems.
- **Prefer composition.** Instead of a `FlyingEnemy` component, combine `Enemy`, `Flying`, and `Patrol` components.
- **Tag components are free.** Empty-schema components (e.g., `PlayerTag`, `DeadTag`) are a zero-cost way to mark entities for queries.

```ts
// Full example: define, create, attach

const Position = defineComponent({ name: 'Position', schema: { x: Types.f32, y: Types.f32 } });
const Velocity = defineComponent({ name: 'Velocity', schema: { x: Types.f32, y: Types.f32 } });

// Inside a system or scene onEnter:
const id = api.createEntity();
api.addComponent(id, Position, { x: 100, y: 200 });
api.addComponent(id, Velocity, { x: 0, y: -9.8 });
```

See [Prefabs](./prefabs.md) for a cleaner way to create entities with multiple components.
