# Physics3D Plugin

Package: `@gwenjs/physics3d`

3D physics adapter (Rapier3D-oriented API) with collision hooks and body management.

## Install

```bash
pnpm add @gwenjs/physics3d
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { Physics3DPlugin } from '@gwenjs/physics3d';

export default defineConfig({
  plugins: [
    Physics3DPlugin({
      gravity: { x: 0, y: -9.81, z: 0 },
      qualityPreset: 'medium',
      coalesceEvents: true,
    }),
  ],
});
```

## API

Main exports:
- `Physics3DPlugin(config?)`
- `PHYSICS3D_MATERIAL_PRESETS`
- type exports for bodies/colliders/events

Service provided:
- `physics3d`

Common config fields:
- `gravity`, `maxEntities`
- `qualityPreset: 'low' | 'medium' | 'high' | 'esport'`
- `coalesceEvents`, `layers`, `debug`

Hooks emitted:
- `physics3d:collision`
- `physics3d:sensor:changed`

## Example

```ts
const p3 = api.services.get('physics3d');

p3.createBody(entityId, {
  kind: 'dynamic',
  initialPosition: { x: 0, y: 2, z: 0 },
});

p3.applyImpulse(entityId, { x: 0, y: 2, z: 0 });
const state = p3.getBodyState(entityId);
```

## Source

- `packages/physics3d/src/index.ts`
- `packages/physics3d/src/types.ts`
