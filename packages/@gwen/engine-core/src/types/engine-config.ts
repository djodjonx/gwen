/**
 * Engine configuration and runtime stats.
 */

import type { GwenWasmPlugin } from './plugin-wasm';
import type { TsPlugin } from './plugin-ts';

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Core engine configuration — passed to `new Engine(config)` or `defineConfig()`.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   maxEntities: 10_000,
 *   targetFPS: 60,
 *   debug: false,
 *   tsPlugins:   [new InputPlugin(), new AudioPlugin()],
 *   wasmPlugins: [Physics2D({ gravity: -9.81 })],
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
  /** WASM plugins (Rust-compiled — physics, AI, networking…). */
  wasmPlugins?: GwenWasmPlugin[];
  /** TypeScript plugins (input, audio, rendering…). */
  tsPlugins?: TsPlugin[];
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
