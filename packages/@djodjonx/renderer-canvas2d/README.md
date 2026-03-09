#@djodjonx/gwen-renderer-canvas2d

**GWEN Canvas2D Renderer Plugin — 2D rendering with HTML Canvas**

Render sprites, shapes, and text using the Canvas 2D API.

## Installation

```bash
npm install@djodjonx/gwen-renderer-canvas2d
```

## Quick Start

### Register the Plugin

```typescript
// gwen.config.ts
import { defineConfig } from '@djodjonx/gwen-kit';
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';

export default defineConfig({
  canvas: 'game-canvas', // ID of your canvas element
  plugins: [new Canvas2DRenderer()],
});
```

### HTML Setup

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Game</title>
    <style>
      canvas {
        display: block;
        background: #222;
      }
    </style>
  </head>
  <body>
    <canvas id="game-canvas" width="800" height="600"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## API Reference

### Rendering Primitives

```typescript
const renderer = api.services.get('renderer');

// Clear canvas
renderer.clear('#222222');

// Fill rectangle
renderer.fillRect(x, y, width, height, color);

// Draw outlined rectangle
renderer.strokeRect(x, y, width, height, color, lineWidth);

// Fill circle
renderer.fillCircle(x, y, radius, color);

// Draw outlined circle
renderer.strokeCircle(x, y, radius, color, lineWidth);

// Draw sprite/image
renderer.drawImage(image, x, y, width, height);

// Draw text
renderer.drawText(text, x, y, { font: '16px Arial', color: '#fff' });
```

### Camera Control

```typescript
// Set camera position
renderer.setCamera(centerX, centerY);

// Set camera scale (zoom)
renderer.setZoom(scale);

// Translate canvas
renderer.translate(x, y);
```

## Examples

### Drawing a Simple Scene

```typescript
const renderer = api.services.get('renderer');

export function renderGame() {
  // Clear
  renderer.clear('#1a1a1a');

  // Background
  renderer.fillRect(0, 0, 800, 600, '#2d2d2d');

  // Draw player
  renderer.fillCircle(playerX, playerY, 16, '#00ff00');

  // Draw enemies
  for (const enemy of enemies) {
    renderer.fillRect(enemy.x, enemy.y, 20, 20, '#ff0000');
  }

  // HUD text
  renderer.drawText(`Score: ${score}`, 10, 30, {
    font: 'bold 20px Arial',
    color: '#ffffff',
  });
}
```

### Camera-Following Gameplay

```typescript
function updateCamera() {
  const renderer = api.services.get('renderer');
  const screenWidth = 800;
  const screenHeight = 600;

  // Center camera on player
  renderer.setCamera(playerX - screenWidth / 2, playerY - screenHeight / 2);
}
```

### Sprite Sheet Animation

```typescript
function drawAnimatedSprite(sheet, frameIndex, x, y) {
  const frameWidth = 64;
  const frameHeight = 64;
  const row = Math.floor(frameIndex / 8);
  const col = frameIndex % 8;

  const sourceX = col * frameWidth;
  const sourceY = row * frameHeight;

  renderer.drawImage(sheet, x, y, frameWidth, frameHeight, {
    sourceX,
    sourceY,
    sourceWidth: frameWidth,
    sourceHeight: frameHeight,
  });
}
```

## Performance Tips

- Use `renderer.clear()` once per frame
- Cache frequently-used colors as constants
- Use `renderer.setCamera()` instead of translating individual objects
- Consider sprite atlasing for many small sprites
- Profile with [@djodjonx/gwen-plugin-debug](../plugin-debug/) to identify bottlenecks

## Browser Compatibility

- Canvas 2D API: All modern browsers
- Best performance on Chrome 90+, Firefox 88+

## See Also

- [@djodjonx/gwen-engine-core](../engine-core/) — Core engine
- [@djodjonx/gwen-plugin-debug](../plugin-debug/) — Performance monitoring
- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
