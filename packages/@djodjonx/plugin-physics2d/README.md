# @djodjonx/gwen-plugin-physics2d

2D physics plugin for GWEN (Rapier2D + WASM).

This documentation is plugin-specific, not engine-wide.

## Installation

```bash
pnpm add @djodjonx/gwen-plugin-physics2d
```

## Quick start

```ts
import { defineConfig } from '@djodjonx/gwen-kit';
import { physics2D } from '@djodjonx/gwen-plugin-physics2d';

export default defineConfig({
  plugins: [
    physics2D({
      gravity: 0,
      gravityX: 0,
      maxEntities: 2000,
    }),
  ],
});
```

## What the plugin provides

- `physics` service (runtime API): add/remove bodies, colliders, velocities, and read collision events.
- Global `physics:collision` hook (enriched contacts with `EntityId`).
- Prefab extension `extensions.physics` (body/collider declaration + `onCollision` callback).
- Composable system `createPhysicsKinematicSyncSystem()` to sync ECS -> physics.

## Config (`physics2D(options)`)

- `gravity?: number` - Y gravity in m/s2 (default `-9.81`)
- `gravityX?: number` - X gravity in m/s2 (default `0`)
- `maxEntities?: number` - max ECS slot capacity (default `10_000`)

## Recommended pattern

1. Declare physics in prefabs with `extensions.physics`.
2. Put collision gameplay logic inside prefab `onCollision(...)`.
3. Add `createPhysicsKinematicSyncSystem()` to the scene when entities are kinematic and driven by ECS `position`.
4. Use the global `physics:collision` hook only for debug/analytics/cross-cutting rules.

## Prefab example

```ts
import { definePrefab } from '@djodjonx/gwen-engine-core';

export const BulletPrefab = definePrefab({
  name: 'Bullet',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      radius: 4,
      onCollision(self, other, contact, api) {
        if (!contact.started) return;
        api.destroyEntity(self);
      },
    },
  },
  create: (api, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, 'position', { x, y });
    return id;
  },
});
```

## Detailed index

- API: `docs/API.md`
- Hooks and extensions: `docs/hooks.md`
- Composable systems: `docs/systems.md`
