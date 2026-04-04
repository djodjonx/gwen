# Layouts

Layouts are declarative factories for composing scenes. Instead of imperatively spawning entities one by one, you define the initial structure once and reuse it.

## Overview

A layout is a blueprint for a game scene. It describes which actors, groups, and prefabs exist, where they are positioned, and how they relate to each other.

### Without Layouts (Imperative)

```typescript
const initializeLevel = () => {
  const playerId = api.spawn(PlayerPrefab);
  const bridge = getWasmBridge().engine();
  bridge.set_entity_local_position(playerId & 0xffffffff, 100, 200);

  const tileIds = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const id = api.spawn(TilePrefab);
      bridge.set_entity_local_position(id & 0xffffffff, x * 32, y * 32);
      tileIds.push(id);
    }
  }

  return { playerId, tileIds };
};
```

### With Layouts (Declarative)

```typescript
const Level1 = defineLayout(() => {
  const player = placeActor(PlayerActor, { at: [100, 200] });

  const tiles = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      tiles.push(placeActor(TileActor, { at: [x * 32, y * 32] }));
    }
  }

  return { player, tiles };
});
```

Layouts keep setup logic together, enable lazy loading, and make bulk disposal a single efficient WASM call.

---

## Defining a Layout

Use `defineLayout()` to create a layout definition. Inside the factory, call `placeActor()`, `placeGroup()`, or `placePrefab()` to compose the scene.

```typescript
import { defineLayout, placeActor, placeGroup } from '@gwenjs/core';
import { PlayerActor } from './actors/player';
import { TileActor } from './actors/tile';

export const DungeonFloor1 = defineLayout(() => {
  // Place the player at world coordinates [100, 200]
  const player = placeActor(PlayerActor, { at: [100, 200] });

  // Place a grid of tiles
  const groundTiles = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      groundTiles.push(placeActor(TileActor, { at: [x * 32, y * 32] }));
    }
  }

  // Return named references for later access
  return { player, groundTiles };
});
```

### Placement Functions

**`placeActor(actorDef, options)`** — Spawn an actor (spawned entity with a system lifecycle).

```typescript
const kart = placeActor(KartActor, {
  at: [400, 300], // World position [x, y]
  props: { hp: 100 }, // Props passed to actor's defineActor() factory
});
```

**`placeGroup(factory, options)`** — Create a transform-only parent container without logic.

```typescript
const container = placeGroup(() => {
  placeActor(WheelActor, { parent: ??? })  // Children reference the container
})
```

**`placePrefab(prefabDef, options)`** — Spawn a prefab instance (an entity without system logic).

```typescript
const tile = placePrefab(TilePrefab, {
  at: [64, 128],
  props: { tileType: 'grass' },
});
```

### Real Example: Mario Kart Grid

```typescript
const KartActor = defineActor(KartPrefab, () => {
  const t = useTransform();
  const input = useInput();

  onUpdate((dt) => {
    const forward = input.axis('vertical');
    const right = input.axis('horizontal');
    t.translate(right * 100 * dt, forward * 100 * dt);
  });

  return {};
});

export const KartsGrid = defineLayout(() => {
  const startPositions = [
    [100, 200],
    [300, 200],
    [500, 200],
    [700, 200],
    [100, 400],
    [300, 400],
    [500, 400],
    [700, 400],
  ];

  const karts = startPositions.map(([x, y], i) =>
    placeActor(KartActor, { at: [x, y], props: { lane: i } }),
  );

  return { karts };
});
```

---

## Loading a Layout

Layouts are lazy-loaded. Use `useLayout()` inside a system or scene to get a handle, then call `load()` when ready.

```typescript
import { defineSystem, useLayout } from '@gwenjs/core';
import { Level1 } from './layouts/level1';

export const gameSystem = defineSystem(() => {
  const level = useLayout(Level1, { lazy: true });

  onEnter(async () => {
    // Load the layout when the scene starts
    await level.load();
    console.log('Player entity ID:', level.refs.player.entityId);
  });
});
```

### Auto-Load (Default)

If you don't pass `{ lazy: true }`, the layout loads immediately:

```typescript
const level = useLayout(Level1); // Loads now, not lazy
```

### Lazy Loading

Pass `{ lazy: true }` to defer loading until you call `load()`:

```typescript
const zone = useLayout(DungeonFloor1, { lazy: true });

onEvent('enter-dungeon', async () => {
  await zone.load();
  zone.refs.player.api.startInDungeon();
});
```

### Accessing Placed Entities

Every placed entity returns a `PlaceHandle` with `entityId` and `api`:

```typescript
const level = useLayout(Level1);

// Access actor API
level.refs.player.api.takeDamage(10);

// Get the raw entity ID for advanced uses
const playerId = level.refs.player.entityId;
```

---

## Disposing a Layout

Call `dispose()` to destroy all entities owned by a layout in a single bulk operation.

```typescript
const zone = useLayout(TownSquare);

onEvent('leave-town', async () => {
  await zone.dispose(); // Bulk-destroy all town entities at once
});
```

::: tip Performance
Disposing 200 entities via `dispose()` takes **0.02ms** using `bulk_destroy()`.
Without layouts, destroying 200 entities one-by-one would take **0.4ms**.
:::

The `dispose()` call is **idempotent** — it's safe to call multiple times:

```typescript
await zone.dispose();
await zone.dispose(); // No error — second call is a no-op
```

### Zone Transition Example

```typescript
export const zoneSystem = defineSystem(() => {
  const currentZone = useLayout(TownSquare, { lazy: true });

  onEvent('enter-dungeon', async () => {
    // Dispose current zone
    await currentZone.dispose();

    // Load next zone
    const dungeon = useLayout(DungeonFloor1, { lazy: true });
    await dungeon.load();
  });
});
```

---

## Multiple Simultaneous Layouts

You can keep multiple layouts active at the same time. Each is independent:

```typescript
export const gameWithUI = defineSystem(() => {
  // Game world
  const gameWorld = useLayout(GameLevel);

  // UI overlay (separate layout, not destroyed with game world)
  const hudLayout = useLayout(HUDLayout);

  onEvent('pause', async () => {
    // Dispose only the game world, keep HUD active
    await gameWorld.dispose();
  });

  onEvent('quit', async () => {
    // Dispose both
    await gameWorld.dispose();
    await hudLayout.dispose();
  });
});
```

---

## Transform Hierarchy

Entities can have parents. Child transforms are relative to the parent's local transform, and Rust automatically propagates world transforms using a dirty-flag algorithm.

Use the `parent:` option to establish parent-child relationships:

```typescript
const WheelActor = defineActor(WheelPrefab, () => {
  const t = useTransform();

  onUpdate((dt) => {
    t.rotate(0.1); // Spin locally, world rotation propagates
  });

  return {};
});

export const KartWithWheels = defineLayout(() => {
  // Place the kart body
  const body = placeActor(KartActor, { at: [400, 300] });

  // Place wheels as children of the body
  const fl = placeActor(WheelActor, { at: [-20, -15], parent: body });
  const fr = placeActor(WheelActor, { at: [20, -15], parent: body });
  const bl = placeActor(WheelActor, { at: [-20, 15], parent: body });
  const br = placeActor(WheelActor, { at: [20, 15], parent: body });

  return { body, wheels: { fl, fr, bl, br } };
});
```

When the kart body rotates, all wheels rotate with it. When the kart translates, wheels translate too. You only set the body's transform — child updates happen automatically.

::: tip Dirty Flag Optimization
GWEN uses a transform dirty-flag algorithm in Rust. Child transforms are only recomputed when the parent is dirty. A stationary parent with 100 moving children computes 1 parent + 100 local transforms = **101 total operations**, not 202.
:::

---

## useTransform()

`useTransform()` provides ergonomic local and world transform access from inside an actor.

```typescript
import { defineActor, useTransform, onUpdate } from '@gwenjs/core';

const PlayerActor = defineActor(PlayerPrefab, () => {
  const t = useTransform();

  onUpdate((dt) => {
    t.translate(velocity.x * dt, velocity.y * dt);
  });
});
```

### Methods

**`translate(dx, dy, dz?)`** — Move relative to current position.

```typescript
t.translate(10, 0); // Move right 10 units
t.translate(0, -5); // Move up 5 units
```

**`setPosition(x, y, z?)`** — Set absolute local position.

```typescript
t.setPosition(100, 200); // Place at (100, 200) relative to parent
```

**`rotateTo(radians)`** — Set absolute local rotation.

```typescript
t.rotateTo(Math.PI / 2); // 90 degrees
```

**`rotate(delta)`** — Rotate relative to current rotation.

```typescript
t.rotate(0.05); // Add 0.05 radians (≈ 2.9 degrees)
```

**`scaleTo(sx, sy)`** — Set local scale.

```typescript
t.scaleTo(2, 1); // 2x wide, 1x tall
t.scaleTo(0.5, 0.5); // Half size
```

### World Transform Reads

Access world-space transforms via `.world` (reads directly from Rust WASM memory):

```typescript
const worldX = t.world.x; // World position
const worldY = t.world.y;
const worldRotation = t.world.rotation;
const worldScaleX = t.world.scaleX;
const worldScaleY = t.world.scaleY;
```

::: tip Performance
`.world` reads use lightweight WASM calls optimized for per-frame access.
For zero-copy SAB reads, use the SharedArrayBuffer transform regions directly
(see `@gwenjs/physics2d` for an example of this pattern).
:::

### Parent Management

**`setParent(handle, keepWorldPos?)`** — Reparent to another entity.

```typescript
// Reparent wheel to new body
wheel.api.t.setParent(newBody, true); // Keep world position
```

**`detach(keepWorldPos?)`** — Detach from parent.

```typescript
t.detach(true); // Detach but stay at world position
```

**`hasParent`** — Check if entity has a parent.

```typescript
if (t.hasParent) {
  t.detach();
}
```

---

## Performance Guide

Layouts are designed for high performance. Here are real numbers from RFC-01 benchmarks:

### Loading Entities

| Scenario       | Old Way                        | With Layouts        |
| -------------- | ------------------------------ | ------------------- |
| Load 200 tiles | ~0.8ms (imperative spawn loop) | ~0.05ms (bulk load) |
| Load 50 NPCs   | ~1.2ms                         | ~0.1ms              |

### Disposal

| Scenario             | Old Way             | With Layouts           |
| -------------------- | ------------------- | ---------------------- |
| Destroy 200 entities | ~0.4ms (one-by-one) | ~0.02ms (bulk destroy) |
| Destroy 50 NPCs      | ~0.1ms              | ~0.004ms               |

### Transform Propagation

**RPG Dungeon Example:**

- 50 NPCs in a room
- 2 NPCs moving each frame
- Stationary players/furniture: transforms not recomputed

**Result:** 96% of transform calculations eliminated via dirty flags. Only the 2 moving NPCs trigger recalculation.

::: tip Bulk Operations
Use `bulk_spawn()` implicitly via layouts, and `bulk_destroy()` via `dispose()`. These are 10–100x faster than per-entity operations.
:::

---

## Use Cases

### RPG Zone Transitions

```typescript
export const dungeonSystem = defineSystem(() => {
  const overworld = useLayout(OverworldLayout, { lazy: true });
  const dungeon = useLayout(DungeonLayout, { lazy: true });

  let currentZone = 'overworld';

  onEvent('enter-dungeon', async () => {
    await overworld.dispose();
    await dungeon.load();
    currentZone = 'dungeon';
  });

  onEvent('exit-dungeon', async () => {
    await dungeon.dispose();
    await overworld.load();
    currentZone = 'overworld';
  });
});
```

### Mario Kart Hierarchies

```typescript
const KartWithWheels = defineLayout(() => {
  const body = placeActor(KartActor, { at: [400, 300] });

  const wheels = {
    fl: placeActor(WheelActor, { at: [-20, -20], parent: body }),
    fr: placeActor(WheelActor, { at: [20, -20], parent: body }),
    bl: placeActor(WheelActor, { at: [-20, 20], parent: body }),
    br: placeActor(WheelActor, { at: [20, 20], parent: body }),
  };

  return { body, wheels };
});
```

When the kart body rotates, all wheels rotate with it. Wheels spin independently without affecting the body.

### Platformer Level Assembly

```typescript
const PlatformerLevel = defineLayout(() => {
  const player = placeActor(PlayerActor, { at: [48, 16] });

  const platforms = [];
  const platformData = [
    { x: 0, y: 224, w: 16, h: 32 },
    { x: 32, y: 192, w: 16, h: 32 },
    { x: 64, y: 160, w: 16, h: 32 },
  ];

  for (const [x, y, w, h] of platformData) {
    platforms.push(
      placeActor(PlatformActor, {
        at: [x, y],
        props: { width: w, height: h },
      }),
    );
  }

  return { player, platforms };
});
```

---

## Common Mistakes

::: warning placeActor outside defineLayout
`placeActor()`, `placeGroup()`, and `placePrefab()` only work **inside a `defineLayout()` factory**.

```typescript
// ❌ Wrong
const actor = placeActor(MyActor, { at: [0, 0] });

// ✅ Correct
const MyLayout = defineLayout(() => {
  const actor = placeActor(MyActor, { at: [0, 0] });
  return { actor };
});
```

For runtime spawning, use `useActor().spawn()` instead.
:::

::: warning useTransform outside defineActor
`useTransform()` must be called **inside a `defineActor()` factory**, not in systems.

```typescript
// ❌ Wrong
const system = defineSystem(() => {
  const t = useTransform(); // Throws error
});

// ✅ Correct
const MyActor = defineActor(MyPrefab, () => {
  const t = useTransform(); // Works
  onUpdate(() => {
    t.translate(10, 0);
  });
});
```

:::

::: tip Idempotent Dispose
Calling `dispose()` multiple times is safe — it's a no-op after the first call.

```typescript
await zone.dispose();
await zone.dispose(); // Safe, no error
```

:::
