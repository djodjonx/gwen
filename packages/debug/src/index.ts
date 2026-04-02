/**
 * DebugPlugin — performance monitoring and FPS tracking.
 *
 * Exposes a `DebugService` via the engine's provide/inject registry as `'debug'`.
 *
 * @example
 * ```typescript
 * import { DebugPlugin } from '@gwenengine/debug';
 *
 * export default defineConfig({
 *   plugins: [DebugPlugin({ overlay: true })],
 * });
 *
 * // In any plugin:
 * const debug = engine.inject('debug' as any) as DebugService;
 * console.log(debug.getMetrics());
 * ```
 */

import { definePlugin } from '@gwenengine/kit';
import type { GwenEngine } from '@gwenengine/core';
import { FpsTracker } from './fps-tracker';
import { DebugOverlay } from './overlay';
import type { DebugMetrics, DebugPluginConfig, DebugOverlayConfig, FpsDropConfig } from './types';

export type { DebugMetrics, DebugPluginConfig, DebugOverlayConfig, FpsDropConfig };

// ── DebugService ──────────────────────────────────────────────────────────────

/**
 * Service exposed by DebugPlugin via `engine.inject('debug' as any)`.
 */
export interface DebugService {
  /** Get the latest metrics snapshot (updated every frame). */
  getMetrics(): DebugMetrics;
  /**
   * Reset the FPS ring buffer and counters.
   * Useful after long operations that distort metrics.
   */
  reset(): void;
  /**
   * Show or hide the debug overlay (no-op if overlay is disabled).
   *
   * @param visible `true` to show, `false` to hide.
   */
  setOverlayVisible(visible: boolean): void;
}

export interface DebugPluginServices {
  debug: DebugService;
}

// ── DebugPlugin ───────────────────────────────────────────────────────────────

function emptyMetrics(): DebugMetrics {
  return {
    fps: 0,
    rollingFps: 0,
    minFps: 0,
    maxFps: 0,
    jitter: 0,
    frameTimeMs: 0,
    frameCount: 0,
    entityCount: 0,
    memoryMB: undefined,
    isDropping: false,
    lastDropAt: 0,
  };
}

export const DebugPlugin = definePlugin((config: DebugPluginConfig = {}) => {
  const windowSize = config.rollingWindowSize ?? 60;
  const updateInterval = config.updateInterval ?? 10;
  const dropThreshold = config.fpsDrop?.threshold ?? 45;
  const dropGrace = config.fpsDrop?.gracePeriodFrames ?? 3;
  const dropCallback: FpsDropConfig['onDrop'] = config.fpsDrop?.onDrop;

  let overlayConfig: DebugOverlayConfig | false;
  if (config.overlay === true) {
    overlayConfig = {};
  } else if (config.overlay && typeof config.overlay === 'object') {
    overlayConfig = config.overlay;
  } else {
    overlayConfig = false;
  }

  let tracker: FpsTracker;
  let overlay: DebugOverlay | null = null;
  let metrics: DebugMetrics = emptyMetrics();
  let consecutiveDropFrames = 0;
  let lastDropAt = 0;
  let framesSinceUpdate = 0;
  let _engine: GwenEngine;

  return {
    name: '@gwenengine/debug',

    setup(engine: GwenEngine): void {
      _engine = engine;
      tracker = new FpsTracker(windowSize);

      if (overlayConfig !== false && typeof document !== 'undefined') {
        overlay = new DebugOverlay(overlayConfig);
      }

      const service: DebugService = {
        getMetrics: () => metrics,
        reset: () => {
          tracker.reset();
          consecutiveDropFrames = 0;
        },
        setOverlayVisible: (v: boolean) => overlay?.setVisible(v),
      };

      engine.provide('debug' as any, service);
    },

    onBeforeUpdate(dt: number): void {
      tracker.push(dt);
      framesSinceUpdate++;

      const instant = tracker.instantFps();

      if (instant < dropThreshold) {
        consecutiveDropFrames++;
      } else {
        consecutiveDropFrames = 0;
      }

      const isDropping = consecutiveDropFrames >= dropGrace;

      if (isDropping) {
        lastDropAt = Date.now();
        dropCallback?.(instant, metrics);
      }

      if (framesSinceUpdate >= updateInterval) {
        framesSinceUpdate = 0;
        metrics = {
          fps: instant,
          rollingFps: tracker.rollingFps(),
          minFps: tracker.minFps(),
          maxFps: tracker.maxFps(),
          jitter: tracker.jitter(),
          frameTimeMs: dt * 1000,
          frameCount: _engine.frameCount,
          entityCount: (() => {
            try {
              return [..._engine.createLiveQuery([])].length;
            } catch {
              return 0;
            }
          })(),
          memoryMB: (() => {
            const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
            return mem ? mem.usedJSHeapSize / (1024 * 1024) : undefined;
          })(),
          isDropping,
          lastDropAt: isDropping ? lastDropAt : metrics.lastDropAt,
        };
        overlay?.update(metrics);
      }
    },

    teardown(): void {
      overlay?.destroy();
      overlay = null;
      tracker.reset();
    },
  };
});

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { useDebug } from './composables.js';
export { default } from './module.js';
