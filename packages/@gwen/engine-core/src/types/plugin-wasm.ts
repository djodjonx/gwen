/**
 * WASM plugin interface — contract for Rust-compiled plugins.
 *
 * A GwenWasmPlugin wraps a `.wasm` module compiled from a Rust crate.
 * It communicates with the TypeScript layer via the Plugin Data Bus
 * (JS-native `ArrayBuffer`s) — no shared linear memory required.
 *
 * @see docs/plugins/wasm-plugins.md
 * @see docs/plugins/wasm-plugin-best-practices.md
 */

import type { EngineAPI } from './engine-api';
import type { PluginChannel } from './plugin-channel';

/**
 * Active interface for all GWEN WASM plugins (physics, AI, networking…).
 *
 * ## Lifecycle
 * 1. `PluginDataBus` allocates one `ArrayBuffer` per declared channel.
 * 2. `await plugin.onInit(bridge, region, api, bus)` — load `.wasm`, register services.
 * 3. Each frame: `plugin.onStep(delta)` — run the Rust simulation.
 * 4. `plugin.onDestroy()` — free WASM resources.
 *
 * ## Minimal example
 * ```ts
 * export class Physics2DPlugin implements GwenWasmPlugin {
 *   readonly id      = 'physics2d';
 *   readonly name    = 'Physics2D';
 *   readonly version = '0.1.0';
 *   readonly sharedMemoryBytes = 0; // use Plugin Data Bus
 *   readonly channels: PluginChannel[] = [
 *     { name: 'transform', direction: 'read',  strideBytes: 20, bufferType: 'f32' },
 *     { name: 'events',    direction: 'write', bufferType: 'ring', capacityEvents: 256 },
 *   ];
 *   readonly provides = { physics: {} as Physics2DAPI };
 *
 *   async onInit(bridge, region, api, bus) {
 *     const transformBuf = bus?.get(this.id, 'transform')?.buffer ?? new ArrayBuffer(0);
 *     const eventsBuf    = bus?.get(this.id, 'events')?.buffer    ?? new ArrayBuffer(0);
 *     const wasm = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js' });
 *     this._wasm = new wasm.Physics2DPlugin(gravity, new Uint8Array(transformBuf), new Uint8Array(eventsBuf));
 *     api.services.register('physics', this._createAPI());
 *   }
 *   onStep(dt) { this._wasm?.step(dt); }
 *   onDestroy() { this._wasm?.free?.(); }
 * }
 * ```
 *
 * @typeParam P - Shape of services this plugin registers in `api.services`
 */
export interface GwenWasmPlugin<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique id — used as key for memory region and channel allocation. */
  readonly id: string;
  /** Human-readable name for logs and the debug overlay. */
  readonly name: string;
  readonly version?: string;

  /**
   * Bytes to allocate in the legacy shared transform buffer.
   * Set to `0` for all new plugins that use the Plugin Data Bus instead.
   * When `0`, `region` will be `null` in `onInit`.
   * @default 0
   */
  readonly sharedMemoryBytes: number;

  /**
   * Channel declarations — `PluginDataBus` allocates one `ArrayBuffer` per entry
   * before `onInit()` is called.
   */
  readonly channels?: PluginChannel[];

  /**
   * Services this plugin contributes to `api.services`.
   * Used by `defineConfig()` for compile-time type inference.
   */
  readonly provides?: P;

  /**
   * Async initialization — called once by `createEngine()` before `engine.start()`.
   *
   * @param bridge  Active WasmBridge (gwen-core already initialized)
   * @param region  Legacy shared memory slice, or `null` if `sharedMemoryBytes === 0`
   * @param api     EngineAPI — call `api.services.register()` here
   * @param bus     Plugin Data Bus — use `bus.get(this.id, channelName)` for pre-allocated buffers
   */
  onInit(
    bridge: import('../engine/wasm-bridge').WasmBridge,
    region: import('../wasm/shared-memory').MemoryRegion | null,
    api: EngineAPI,
    bus?: import('../wasm/plugin-data-bus').PluginDataBus,
  ): Promise<void>;

  /**
   * Optional pre-fetch — called in parallel before the sequential `onInit()` phase.
   * Use it to kick off the `.wasm` binary download early.
   */
  _prefetch?(): Promise<void>;

  /**
   * Called each frame at the WASM step slot — before `TsPlugin.onUpdate`.
   * Run `this._wasm.step(delta)` here.
   */
  onStep?(deltaTime: number): void;

  /**
   * Called when `gwen-core`'s WASM linear memory grows (`memory.grow()` event).
   * Re-wrap any `TypedArray` views that point into the old (now detached) buffer.
   */
  onMemoryGrow?(newMemory: WebAssembly.Memory): void;

  /** Called when the engine stops. Free all WASM resources. */
  onDestroy?(): void;
}
