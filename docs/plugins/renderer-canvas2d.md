# Canvas2D Renderer Plugin

**Package:** `@gwenjs/renderer-canvas2d`
**Service key:** `renderer` (`RendererService`)

Hardware-accelerated 2D renderer built on the browser's Canvas2D API. Automatically draws entities that carry `SpriteComponent` or `ShapeComponent` based on their `TransformComponent`. Supports cameras, pixel-ratio scaling, and imperative shape drawing via `ShapeRenderer`.

## Install

```bash
gwen add @gwenjs/renderer-canvas2d
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: [
    [
      '@gwenjs/renderer-canvas2d',
      {
        width: 800,
        height: 600,
        pixelRatio: window.devicePixelRatio,
      },
    ],
  ],
});
```

The renderer creates and mounts a `<canvas>` element automatically unless you pass an existing one via the `canvas` option.

## Service API

### `renderer` — `RendererService`

| Property / Method              | Description                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| `renderer.canvas`              | The underlying `HTMLCanvasElement`.                             |
| `renderer.ctx`                 | The `CanvasRenderingContext2D`.                                 |
| `renderer.width`               | Logical canvas width in pixels.                                 |
| `renderer.height`              | Logical canvas height in pixels.                                |
| `renderer.setCamera(camera)`   | Set the active camera. Accepts a `Camera2D` object.             |
| `renderer.getCamera()`         | Returns the current `Camera2D`.                                 |
| `renderer.worldToScreen(x, y)` | Convert world coordinates to screen pixels.                     |
| `renderer.screenToWorld(x, y)` | Convert screen pixels to world coordinates.                     |
| `renderer.clear(color?)`       | Clear the canvas. Optional background fill colour (CSS string). |

### `ShapeRenderer`

Access via `useCanvas2D()` inside `defineSystem`:

```typescript
const { shapes } = useCanvas2D();
```

| Method                               | Description                      |
| ------------------------------------ | -------------------------------- |
| `shapes.rect(x, y, w, h, style)`     | Draw a filled/stroked rectangle. |
| `shapes.circle(x, y, r, style)`      | Draw a circle.                   |
| `shapes.line(x1, y1, x2, y2, style)` | Draw a line.                     |
| `shapes.text(str, x, y, style)`      | Draw text.                       |

`style` is `{ fill?: string; stroke?: string; lineWidth?: number; font?: string }`.

### `Camera2D`

```typescript
interface Camera2D {
  x: number; // world-space position
  y: number;
  zoom: number; // 1.0 = normal
  rotation: number; // radians
}
```

## Options

| Option       | Type                   | Default         | Description                                              |
| ------------ | ---------------------- | --------------- | -------------------------------------------------------- |
| `width`      | `number`               | **required**    | Logical canvas width in CSS pixels.                      |
| `height`     | `number`               | **required**    | Logical canvas height in CSS pixels.                     |
| `canvas`     | `HTMLCanvasElement`    | auto-created    | Provide an existing canvas to draw into.                 |
| `pixelRatio` | `number`               | `1`             | Device pixel ratio for sharp rendering on HiDPI screens. |
| `background` | `string`               | `'#000000'`     | Background clear colour applied each frame.              |
| `mountTo`    | `HTMLElement`          | `document.body` | Parent element for the auto-created canvas.              |
| `sortKey`    | `'z' \| 'y' \| 'none'` | `'z'`           | Depth-sort strategy for sprites.                         |

## Example

```typescript
import { defineSystem, useService, onRender } from '@gwenjs/core';
import { useCanvas2D } from '@gwenjs/renderer-canvas2d';
import { useQuery } from '@gwenjs/core';
import { Position, Health } from '../components';

export const healthBarSystem = defineSystem(() => {
  const { shapes } = useCanvas2D();
  const entities = useQuery([Position, Health]);

  onRender(() => {
    for (const entity of entities) {
      const pos = entity.get(Position);
      const health = entity.get(Health);
      const pct = health.current / health.max;

      // Background bar
      shapes.rect(pos.x - 16, pos.y - 24, 32, 4, { fill: '#333' });
      // Health fill
      shapes.rect(pos.x - 16, pos.y - 24, 32 * pct, 4, { fill: '#0f0' });
    }
  });
});
```

::: info Automatic sprite rendering
You don't need to call any draw method for entities with `SpriteComponent` + `TransformComponent` — the renderer handles those automatically in the `onRender` phase.
:::

## Related

- [Sprite Animation](/plugins/sprite-anim) — animate sprite sheets drawn by this renderer
- [Debug Plugin](/plugins/debug) — draws on top of this canvas
- [React Three Fiber](/plugins/r3f) — alternative 3D renderer
