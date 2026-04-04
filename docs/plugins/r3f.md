# React Three Fiber Plugin

**Package:** `@gwenjs/r3f`
**Service key:** `r3f` (`R3FService`)

Adapter that bridges the GWEN ECS with [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) as the 3D renderer. Game logic, entity management, and frame scheduling stay in GWEN; Three.js and R3F handle the scene graph and GPU rendering. You get the entire Three.js ecosystem — post-processing, loaders, helpers, Drei — while ECS data drives the objects.

## Peer dependencies

```bash
pnpm add @gwenjs/r3f react react-dom @react-three/fiber three
```

`react`, `react-dom`, `@react-three/fiber`, and `three` are peer dependencies and must be installed separately.

## Install

```bash
gwen add @gwenjs/r3f
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: [
    [
      '@gwenjs/r3f',
      {
        mountTo: document.getElementById('app')!,
      },
    ],
  ],
});
```

The plugin mounts an R3F `<Canvas>` into the target element and takes over the render loop, delegating frame timing back to GWEN's scheduler.

## Service API

### `r3f` — `R3FService`

| Property / Method                   | Description                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `r3f.scene`                         | The Three.js `Scene` root.                                                                                                                 |
| `r3f.camera`                        | The active Three.js `Camera`.                                                                                                              |
| `r3f.renderer`                      | The `WebGLRenderer` instance.                                                                                                              |
| `r3f.setCamera(camera)`             | Swap the active camera.                                                                                                                    |
| `r3f.addObject(entityId, object3D)` | Register a `THREE.Object3D` as the visual for an entity. The plugin syncs its transform from the entity's `TransformComponent` each frame. |
| `r3f.removeObject(entityId)`        | Remove and dispose the entity's `Object3D`.                                                                                                |
| `r3f.getObject(entityId)`           | Returns the `THREE.Object3D` associated with an entity, or `undefined`.                                                                    |

### `useR3F()` composable

```typescript
import { useR3F } from '@gwenjs/r3f';

const r3f = useR3F(); // shorthand for useService('r3f')
```

### React component integration

Mount R3F JSX components into the scene from inside a `defineSystem`:

```typescript
import { useR3FRoot } from '@gwenjs/r3f'
import { SkyBox } from './components/SkyBox'

const root = useR3FRoot()
root.add(<SkyBox />)
```

## Options

| Option    | Type                      | Default             | Description                                    |
| --------- | ------------------------- | ------------------- | ---------------------------------------------- |
| `mountTo` | `HTMLElement`             | `document.body`     | Parent element for the R3F canvas.             |
| `camera`  | `THREE.Camera`            | `PerspectiveCamera` | Initial camera.                                |
| `shadows` | `boolean`                 | `false`             | Enable shadow maps.                            |
| `dpr`     | `number \| [min, max]`    | `[1, 2]`            | Device pixel ratio passed to R3F `<Canvas>`.   |
| `gl`      | `WebGLRendererParameters` | `{}`                | Extra parameters forwarded to `WebGLRenderer`. |

## Example

```typescript
import { defineSystem, onUpdate } from '@gwenjs/core';
import { useR3F } from '@gwenjs/r3f';
import { useQuery } from '@gwenjs/core';
import * as THREE from 'three';
import { Position3D, Rotation3D } from '../components';

export const meshSyncSystem = defineSystem(() => {
  const r3f = useR3F();
  const entities = useQuery([Position3D, Rotation3D]);

  // Create Three.js meshes for new entities
  onUpdate(() => {
    for (const entity of entities.added) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({ color: 0x4488ff });
      const mesh = new THREE.Mesh(geometry, material);

      r3f.addObject(entity.id, mesh);
    }

    for (const entity of entities.removed) {
      r3f.removeObject(entity.id);
    }

    // Manual sync if you need it (automatic sync also runs each frame)
    for (const entity of entities) {
      const pos = entity.get(Position3D);
      const obj = r3f.getObject(entity.id);
      if (obj) {
        obj.position.set(pos.x, pos.y, pos.z);
      }
    }
  });
});
```

::: info Automatic transform sync
Entities with both a `TransformComponent` (or `Position3D`/`Rotation3D`) and a registered `Object3D` are synced automatically each frame before R3F renders. You only need the manual loop above if you want custom transform logic.
:::

::: tip Physics3D + R3F
`@gwenjs/physics3d` and `@gwenjs/r3f` are designed to work together. The physics module writes world-space transforms into shared memory, the engine core propagates them to `TransformComponent`, and R3F reads them — all without any JS copying.
:::

## Related

- [Physics 3D](/plugins/physics3d) — 3D physics that drives transforms consumed by R3F
- [UI Plugin](/plugins/ui) — HTML overlay to pair with the 3D canvas
- [Canvas2D Renderer](/plugins/renderer-canvas2d) — alternative 2D-only renderer
