# Debug Plugin

Package: `@gwenjs/debug`

Runtime performance metrics and optional overlay.

## Install

```bash
pnpm add @gwenjs/debug
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { DebugPlugin } from '@gwenjs/debug';

export default defineConfig({
  plugins: [
    DebugPlugin({
      overlay: true,
      rollingWindowSize: 60,
      updateInterval: 10,
    }),
  ],
});
```

## API

Main export:
- `DebugPlugin(config?)`

Service provided:
- `debug`

`DebugService` methods:
- `getMetrics()`
- `reset()`
- `setOverlayVisible(visible)`

Key metrics include:
- `fps`, `rollingFps`, `minFps`, `maxFps`
- `jitter`, `frameTimeMs`, `frameCount`
- `entityCount`, `memoryMB`
- `isDropping`, `lastDropAt`

## Example

```ts
const debug = api.services.get('debug');

onUpdate(() => {
  const m = debug.getMetrics();
  if (m.isDropping) {
    console.warn('Frame drop', m.fps, m.frameTimeMs);
  }
});
```

## Source

- `packages/debug/src/index.ts`
