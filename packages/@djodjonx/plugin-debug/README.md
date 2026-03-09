#@djodjonx/gwen-plugin-debug

**GWEN Debug Plugin — FPS monitor, performance metrics, and debug overlay**

Monitor your game's performance with real-time metrics and a visual overlay.

## Installation

```bash
npm install@djodjonx/gwen-plugin-debug
```

## Quick Start

### Register the Plugin

```typescript
// gwen.config.ts
import { defineConfig } from '@djodjonx/gwen-kit';
import { DebugPlugin } from '@djodjonx/gwen-plugin-debug';

export default defineConfig({
  plugins: [process.env.NODE_ENV === 'development' && new DebugPlugin()].filter(Boolean),
});
```

### Enable/Disable Debug Overlay

```typescript
const debug = api.services.get('debug');

// Toggle overlay visibility
debug.setVisible(true);

// Toggle specific metrics
debug.showMetric('fps', true);
debug.showMetric('frameTime', true);
debug.showMetric('entityCount', true);
```

## API Reference

### Constructor Options

```typescript
new DebugPlugin({
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  opacity?: number,           // 0-1, default: 0.8
  fontSize?: number,          // default: 12
  updateInterval?: number,    // ms, default: 100
})
```

### `setVisible(visible: boolean)`

Show or hide the debug overlay.

### `showMetric(metric: string, show: boolean)`

Toggle specific metrics:

- `'fps'` — Frames per second
- `'frameTime'` — Frame render time (ms)
- `'entityCount'` — Number of active entities
- `'memory'` — Memory usage (if available)
- `'drops'` — Frame drops (frames below 30 FPS)

### Metrics Properties

Access real-time metrics:

```typescript
const debug = api.services.get('debug');
console.log(debug.fps);
console.log(debug.frameTime);
console.log(debug.entityCount);
console.log(debug.frameDrops);
```

## Examples

### Performance Monitoring

```typescript
const debug = api.services.get('debug');

// Log stats every second
setInterval(() => {
  console.log(`FPS: ${debug.fps.toFixed(1)}`);
  console.log(`Frame time: ${debug.frameTime.toFixed(2)}ms`);
  console.log(`Entities: ${debug.entityCount}`);
  console.log(`Frame drops: ${debug.frameDrops}`);
}, 1000);
```

### Conditional Performance Logging

```typescript
if (debug.frameTime > 16.67) {
  // Frame took longer than 60 FPS target
  console.warn('Frame drop detected!', debug.frameTime);
}
```

### Production Builds

```typescript
// Only include in development
const plugins = [];
if (import.meta.env.DEV) {
  plugins.push(new DebugPlugin());
}

export default defineConfig({ plugins });
```

## Metrics Explained

- **FPS** — Frames per second (target: 60 for smooth gameplay)
- **Frame Time** — Milliseconds spent rendering one frame (target: 16.67ms for 60 FPS)
- **Entity Count** — Active entities in the game world
- **Frame Drops** — Count of frames below 30 FPS threshold
- **Memory** — JavaScript heap size (browser dependent)

## Browser DevTools Integration

For deeper analysis, use your browser's DevTools:

- Chrome: DevTools → Performance tab
- Firefox: Web Performance tools
- Safari: Develop → Show Web Inspector

## See Also

- [@djodjonx/gwen-engine-core](../engine-core/) — Core engine
- [@djodjonx/gwen-plugin-input](../plugin-input/) — Input handling
- [@djodjonx/gwen-plugin-audio](../plugin-audio/) — Audio system
