/**
 * Engine configuration and runtime stats.
 */

import type { GwenPlugin } from './plugin';

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Core engine configuration — passed to `new Engine(config)` or `defineConfig()`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   maxEntities: 10_000,
 *   targetFPS: 60,
 *   plugins: [
 *     physics2D({ gravity: -9.81 }),
 *     new InputPlugin(),
 *     new AudioPlugin(),
 *   ],
 * });
 * ```
 */
export interface EngineConfig {
  /** Maximum number of simultaneously alive entities. Minimum: 100. */
  maxEntities: number;
  /** Target frames per second. Range: [1, 300]. */
  targetFPS: number;
  /** Enable debug logging and sentinel integrity checks. @default false */
  debug?: boolean;
  /** Collect performance statistics each frame. @default true */
  enableStats?: boolean;

  /**
   * All plugins — TS-only and WASM plugins mixed in declaration order.
   *
   * WASM plugins (those with a `wasm` sub-object) are automatically detected
   * and routed through the async WASM initialisation pipeline by `createEngine()`.
   *
   * @example
   * ```ts
   * plugins: [
   *   physics2D({ gravity: -9.81 }), // WASM — has `wasm` sub-object
   *   new InputPlugin(),              // TS-only
   *   new AudioPlugin(),
   * ]
   * ```
   */
  plugins?: GwenPlugin[];

  /**
   * @deprecated Use `plugins` instead.
   *
   * WASM plugins previously required a separate array. Migrate by moving all
   * entries into the unified `plugins` array — detection is automatic.
   */
  wasmPlugins?: GwenPlugin[];

  /**
   * @deprecated Use `plugins` instead.
   *
   * TS plugins previously required a separate array. Migrate by moving all
   * entries into the unified `plugins` array.
   */
  tsPlugins?: GwenPlugin[];
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Snapshot of engine runtime metrics — returned by `engine.getStats()`.
 */
export interface EngineStats {
  /** Measured frames per second (updated every 60 frames). */
  fps: number;
  /** Total frames rendered since `engine.start()`. */
  frameCount: number;
  /** Delta time of the last frame in seconds (capped at 0.1 s). */
  deltaTime: number;
  /** Number of currently alive entities. */
  entityCount: number;
  /** `true` if the game loop is currently running. */
  isRunning: boolean;
}
