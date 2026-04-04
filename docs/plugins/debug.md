# Debug Plugin

**Package:** `@gwenjs/debug`
**Service key:** `debug` (`DebugService`)

On-canvas debug overlay for development. Displays performance stats, entity counts, and per-system timings, and exposes an imperative API for drawing diagnostic shapes and text on top of the game. Only register this plugin in development builds — it has no meaningful overhead when absent.

## Install

```bash
gwen add @gwenjs/debug --dev
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: [
    // Only in development — zero cost in production builds
    ...(import.meta.env.DEV ? [['@gwenjs/debug', { position: 'top-left' }]] : []),
  ],
});
```

## Service API

### Visibility

| Method              | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `debug.show()`      | Show the debug overlay.                                   |
| `debug.hide()`      | Hide the debug overlay (still active, just not rendered). |
| `debug.toggle()`    | Toggle visibility. Useful for a hotkey.                   |
| `debug.isVisible()` | Returns `true` if the overlay is currently shown.         |

### Stats panel

The stats panel renders automatically each frame when visible. It includes:

- **FPS** — frames per second (rolling 60-frame average)
- **Frame time** — total frame duration in ms
- **Entity count** — live entity count from the ECS
- **System times** — per-system execution time in ms (expandable list)
- **WASM heap** — current WASM linear memory usage

### Imperative drawing

All draw calls are queued during `onUpdate`/`onRender` and flushed at the end of the frame, always on top of the game content.

| Method                                     | Description                                |
| ------------------------------------------ | ------------------------------------------ |
| `debug.drawRect(x, y, w, h, color?)`       | Draw an outlined rectangle in world space. |
| `debug.drawFilledRect(x, y, w, h, color?)` | Draw a filled rectangle in world space.    |
| `debug.drawCircle(x, y, radius, color?)`   | Draw an outlined circle.                   |
| `debug.drawLine(x1, y1, x2, y2, color?)`   | Draw a line segment.                       |
| `debug.drawText(text, x, y, style?)`       | Draw text at world-space coordinates.      |
| `debug.drawVector(x, y, dx, dy, color?)`   | Draw a vector arrow (origin + direction).  |

`color` is any CSS colour string (default `'#00ff00'`).
`style` is `{ color?: string; font?: string; size?: number }`.

### Custom stats

Register your own stats entries that appear in the panel:

```typescript
debug.registerStat('pooled-bullets', () => bulletPool.size);
```

## Options

| Option              | Type                                                           | Default      | Description                                           |
| ------------------- | -------------------------------------------------------------- | ------------ | ----------------------------------------------------- |
| `position`          | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'top-left'` | Corner where the stats panel appears.                 |
| `visible`           | `boolean`                                                      | `true`       | Whether the overlay starts visible.                   |
| `showSystemTimings` | `boolean`                                                      | `true`       | Include per-system timings in the panel.              |
| `showWasmStats`     | `boolean`                                                      | `true`       | Include WASM heap and entity memory stats.            |
| `hotkey`            | `string`                                                       | `'F3'`       | Key code to toggle visibility (`KeyboardEvent.code`). |

## Example

```typescript
import { defineSystem, useService, onUpdate, onRender } from '@gwenjs/core';
import { useQuery } from '@gwenjs/core';
import { Position, Collider } from '../components';

export const colliderDebugSystem = defineSystem(() => {
  const debug = useService('debug');
  const entities = useQuery([Position, Collider]);

  // Toggle with Backquote key in addition to the default F3
  const keyboard = useService('keyboard');
  onUpdate(() => {
    if (keyboard.isPressed('Backquote')) debug.toggle();
  });

  // Draw collider outlines every render frame
  onRender(() => {
    if (!debug.isVisible()) return;
    for (const entity of entities) {
      const pos = entity.get(Position);
      const collider = entity.get(Collider);
      debug.drawRect(
        pos.x - collider.halfW,
        pos.y - collider.halfH,
        collider.halfW * 2,
        collider.halfH * 2,
        '#ff0',
      );
    }
  });
});
```

::: warning Development only
`@gwenjs/debug` should be a `devDependency`. Conditionally register it with `import.meta.env.DEV` so it is tree-shaken from production bundles entirely.
:::

## Related

- [Physics 2D](/plugins/physics2d) — use `drawRect` to visualise collider bounds
- [Canvas2D Renderer](/plugins/renderer-canvas2d) — the debug overlay draws on top of this canvas
- [Vite Plugin](/plugins/vite) — `import.meta.env.DEV` is injected at build time by the Vite plugin
