---
name: gwen-renderer-canvas2d
description: Expert skill for the 2D rendering pipeline, sprite components, cameras, and primitive shape drawing.
---

# Canvas 2D Renderer Expert Skill

## Context
GWEN Renderer Canvas 2D is the primary visual engine. It iterates over entities with `transform` and `sprite` components and draws them onto a `<canvas>` element.

## Instructions

### 1. Configuration & Viewport
Configure the renderer in `gwen.config.ts`.
```typescript
import { Canvas2DRenderer } from '@djodjonx/renderer-canvas2d';

export default defineConfig({
  plugins: [
    new Canvas2DRenderer({
      canvasId: 'game-canvas',
      width: 800, height: 600,
      pixelArt: true, // Disables image smoothing
      clearColor: '#1a1a1a',
      camera: { x: 0, y: 0, zoom: 1 } // Initial camera state
    })
  ],
});
```

### 2. Rendering ECS Components
Rendering depends on specific component data.
- **`transform`**: `{ x, y, rotation, scaleX, scaleY }`. Essential for positioning.
- **`sprite`**: `{ texture, sourceRect, anchor, flipX, flipY, alpha }`. 
  - `texture`: ID defined in the asset manifest.
  - `anchor`: `(0.5, 0.5)` for center, `(0, 0)` for top-left.

### 3. Primitive Shapes (`ShapeRenderer`)
Draw custom overlays or debug shapes directly to the canvas in a system's `onDraw` phase.
```typescript
import { ShapeRenderer } from '@djodjonx/renderer-canvas2d';

// ctx: CanvasRenderingContext2D, injected in onDraw or available via renderer
ShapeRenderer.drawRect(ctx, { x, y, w, h, color: 'blue', fill: true });
ShapeRenderer.drawCircle(ctx, { x, y, radius: 10, color: 'white', thickness: 2 });
ShapeRenderer.drawText(ctx, { x, y, text: 'XP: 100', font: '12px Arial', color: 'yellow' });
```

### 4. Camera Control (`renderer` service)
The camera is managed globally via the renderer service.
- `setCamera(x, y, zoom)`: Moves the global viewport.
- `getCamera()`: Current camera state.
- `screenToWorld(sx, sy)`: Convert mouse/screen pixels to world coordinates.
- `worldToScreen(wx, wy)`: Useful for UI elements tracking world objects.

## Available Resources
- `packages/@djodjonx/renderer-canvas2d/src/renderer.ts`: Main render loop implementation.
- `packages/@djodjonx/renderer-canvas2d/src/shapes.ts`: `ShapeRenderer` helper class.

## Constraints
- **Antialiasing**: Use `pixelArt: true` for games that require sharp sprite edges (e.g., retro-style games).
- **Z-Ordering**: The current renderer sorts entities by their **creation order** or specific internal grouping. Complex Z-sorting requires custom systems or multiple render layers.
- **Draw Lifecycle**: Only use `ShapeRenderer` during the engine's dedicated draw cycle to ensure correct camera transformation application.
