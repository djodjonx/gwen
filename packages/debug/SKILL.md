---
name: gwen-debug
description: Expert skill for performance auditing, rolling frame-time metrics, and automatic FPS drop detection.
---

# Debug Expert Skill

## Context
GWEN Debug provides high-precision performance monitoring. It tracks instantaneous FPS, rolling averages (jitter detection), entity counts, and memory heap size.

## Instructions

### 1. Configuration & Thresholds
Set up the debug plugin with smart drop detection.
```typescript
import { DebugPlugin } from '@gwenjs/gwen-plugin-debug';

export default defineConfig({
  plugins: [
    new DebugPlugin({ 
      overlay: true, 
      rollingWindowSize: 120, // Frames used for jitter calculation
      updateInterval: 10,     // Frequency of metrics update
      fpsDrop: { 
        threshold: 45, 
        gracePeriodFrames: 5, // Consecutive frames below threshold to trigger drop
        onDrop: (fps, metrics) => logPerfIssue(fps, metrics) 
      }
    })
  ],
});
```

### 2. Metrics Snapshot (`debug` service)
Get the `DebugMetrics` object which includes:
- `fps` / `rollingFps`: Current vs Window average.
- `minFps` / `maxFps`: Frame outliers.
- `jitter`: Standard deviation in frame timing (vital for perceived smoothness).
- `memoryMB`: `usedJSHeapSize` (Chrome only).
- `isDropping` / `lastDropAt`: Real-time performance state.

### 3. Debug Overlay
Toggle the visual HUD at runtime: `debug.setOverlayVisible(boolean)`. The overlay is automatically updated every `updateInterval`.

## Available Resources
- `packages/@gwenjs/plugin-debug/src/fps-tracker.ts`: Internal logic for rolling averages and jitter.
- `packages/@gwenjs/plugin-debug/src/types.ts`: `DebugMetrics` and `DebugPluginConfig` types.

## Constraints
- **Performance**: Metrics polling (especially `api.query([]).length`) has a cost. Keep `updateInterval` at 10+ frames.
- **Privacy**: Memory metrics require specific browser flags or headers (Cross-Origin isolation) and are only available in Chromium-based browsers.
- **Outliers**: Use `debug.reset()` after heavy one-time operations (e.g., scene load, large asset fetch) to clear historical stats.
