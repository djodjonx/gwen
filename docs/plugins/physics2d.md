# Physics2D Plugin

Package: `@gwenjs/physics2d`

2D rigid-body physics adapter over the GWEN WASM core.

## Install

```bash
pnpm add @gwenjs/physics2d
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { physics2D } from '@gwenjs/physics2d';

export default defineConfig({
  plugins: [
    physics2D({
      gravity: -9.81,
      gravityX: 0,
      qualityPreset: 'medium',
      eventMode: 'pull',
      coalesceEvents: true,
    }),
  ],
});
```

## API

Main exports:
- `physics2D(config?)`
- `Physics2DPlugin`
- tilemap helpers and physics systems

Service provided:
- `physics`

Common config fields:
- `gravity`, `gravityX`, `maxEntities`
- `qualityPreset: 'low' | 'medium' | 'high' | 'esport'`
- `eventMode: 'pull' | 'hybrid'`
- `coalesceEvents`, `ccdEnabled`, `layers`

Hooks emitted:
- `physics:collision`
- `physics:collision:batch`
- `physics:sensor:changed`

## Example

```ts
const physics = api.services.get('physics');

physics.addRigidBody(entityId, 'dynamic', 0, 2, { mass: 1 });
physics.addBoxCollider(entityId, 0.5, 0.5, { friction: 0.8 });

const contacts = physics.getCollisionContacts();
for (const c of contacts) {
  if (c.started) {
    // react to collision
  }
}
```

## Source

- `packages/physics2d/src/index.ts`
- `packages/physics2d/src/types.ts`
