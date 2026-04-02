# Canvas2D Renderer Plugin

Package: `@gwenjs/renderer-canvas2d`

Canvas2D rendering plugin exposing a typed `renderer` service.

## Install

```bash
pnpm add @gwenjs/renderer-canvas2d
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d';

export default defineConfig({
  plugins: [
    Canvas2DRenderer({
      width: 960,
      height: 540,
      background: '#101317',
    }),
  ],
});
```

## API

Main exports:
- `Canvas2DRenderer(config?)`
- `ShapeRenderer`

Service provided:
- `renderer`

`RendererService`:
- `canvas`, `ctx`
- `width`, `height`, `logicalWidth`, `logicalHeight`
- `setCamera(partialCamera)`
- `getCamera()`
- `followTarget(x, y, lerp?)`
- `resize(width, height)`

Config options:
- `canvas`, `container`
- `width`, `height`
- `background`, `pixelRatio`
- `manualRender`

## Example

```ts
const renderer = api.services.get('renderer');
renderer.setCamera({ x: 120, y: 80, zoom: 1.25 });

const { ctx } = renderer;
ctx.fillStyle = '#4fffb0';
ctx.fillRect(32, 32, 64, 64);
```

## Source

- `packages/renderer-canvas2d/src/index.ts`
- `packages/renderer-canvas2d/src/renderer.ts`
