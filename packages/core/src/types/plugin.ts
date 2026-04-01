/**
 * @file Unified GWEN plugin interface.
 *
 * A single `GwenPlugin` interface covers both pure TypeScript plugins and
 * plugins that embed a WASM runtime. The optional `wasm` sub-object is the
 * only structural difference between the two families:
 *
 * - **TS-only plugin** — `wasm` is absent. The engine calls the standard
 *   `onInit / onBeforeUpdate / onUpdate / onRender / onDestroy` callbacks.
 *
 * - **WASM plugin** — `wasm` is present. The engine additionally runs the
 *   async WASM initialisation pipeline (`prefetch` → `onInit`) before the
 *   game loop starts, and calls `wasm.onStep` every frame *before*
 *   `onUpdate`.
 *
 * @example TS-only plugin
 * ```ts
 * export class AudioPlugin implements GwenPlugin<'AudioPlugin', { audio: AudioManager }> {
 *   readonly name = 'AudioPlugin' as const;
 *   readonly provides = { audio: {} as AudioManager };
 *   onInit(api: EngineAPI) { api.services.register('audio', new AudioManager()); }
 * }
 * ```
 *
 * @example WASM plugin
 * ```ts
 * export class Physics2DPlugin implements GwenPlugin<'Physics2D', { physics: Physics2DAPI }> {
 *   readonly name = 'Physics2D' as const;
 *   readonly provides = { physics: {} as Physics2DAPI };
 *   readonly wasm: GwenPluginWasmContext = {
 *     id: 'physics2d',
 *     channels: [{ name: 'transform', direction: 'read', strideBytes: 20, bufferType: 'f32' }],
 *     onInit: async (_bridge, _region, api, bus) => { ... },
 *     onStep: (dt) => { this._wasm?.step(dt); },
 *   };
 * }
 * ```
 */

import type { EngineAPI } from './engine-api';
import type { PluginChannel } from './plugin-channel';
import type { SystemQuery, QueryResult } from '../core/query-result';

// ── WASM context ──────────────────────────────────────────────────────────────

/**
 * WASM runtime context declared on a plugin that embeds a `.wasm` module.
 *
 * Its presence on a `GwenPlugin` is the sole discriminant used by
 * `createEngine()` to route the plugin through the async WASM initialisation
 * pipeline rather than the synchronous TS one.
 */
export interface GwenPluginWasmContext {
  /**
   * Unique WASM plugin identifier.
   * Used as the key for memory-region allocation and Plugin Data Bus channels.
   * Must be stable across restarts (it is persisted as a buffer key).
   *
   * @example `'physics2d'`, `'ai-navigation'`
   */
  readonly id: string;

  /**
   * Explicit SharedArrayBuffer opt-in for this plugin.
   *
   * - `false` (default): DataBus-only path, no SAB requirement.
   * - `true`: plugin expects a SAB region and requires COOP/COEP headers.
   */
  readonly sharedMemory?: boolean;

  /**
   * Bytes to reserve in the legacy shared transform buffer (SAB).
   * Set to `0` (default) to opt out of SAB and rely solely on the Plugin Data Bus.
   * When `0`, `region` will be `null` in `onInit`.
   *
   * @default 0
   */
  readonly sharedMemoryBytes?: number;

  /**
   * Channel declarations — one `ArrayBuffer` per entry is pre-allocated by
   * `PluginDataBus` **before** `onInit` is called.
   *
   * Two channel kinds are available:
   * - `DataChannel`  — bulk typed arrays (transforms, velocities…)
   * - `EventChannel` — ring-buffer of fixed-size binary events (collisions…)
   */
  readonly channels?: PluginChannel[];

  /**
   * Optional parallel pre-fetch step.
   *
   * Called concurrently with other plugins' `prefetch()` before the sequential
   * `onInit` phase begins. Use it to kick off the `.wasm` binary download
   * early, cache the result internally, and avoid a redundant round-trip in
   * `onInit`.
   *
   * Plugins that do not implement `prefetch` simply fetch inside `onInit`.
   */
  prefetch?(): Promise<void>;

  /**
   * Async WASM initialisation — called once by `createEngine()` before
   * `engine.start()`, in declaration order (sequential, not parallel).
   *
   * Responsibilities:
   * 1. Load / instantiate the `.wasm` binary (use the cached module from
   *    `prefetch` if available).
   * 2. Mount shared memory views on `region` or `bus` buffers.
   * 3. Register services via `api.services.register()`.
   *
   * @param bridge  Active `WasmBridge` — gwen-core is already initialised.
   * @param region  Pre-allocated SAB slice, or `null` if `sharedMemoryBytes === 0`.
   * @param api     Engine API — use `api.services.register()` here only.
   * @param bus     Plugin Data Bus — call `bus.get(id, channelName)` for buffers.
   */
  onInit(
    bridge: import('../engine/wasm-bridge').WasmBridge,
    region: import('../wasm/shared-memory').MemoryRegion | null,
    api: EngineAPI,
    bus: import('../wasm/plugin-data-bus').PluginDataBus,
  ): Promise<void>;

  /**
   * Per-frame WASM simulation tick — called **before** `GwenPlugin.onUpdate`.
   *
   * Run `this._wasmInstance.step(deltaTime)` here. Keep this method as lean
   * as possible; heavy JS work should go in `onUpdate` instead.
   *
   * @param deltaTime Frame delta time in seconds (capped at 0.1 s).
   */
  onStep?(deltaTime: number): void;

  /**
   * Memory-grow callback (**OPTIONAL** — advanced use case only).
   *
   * Called when gwen-core's WASM linear memory grows (`memory.grow()` event).
   * Any `TypedArray` or `DataView` views built over the old `ArrayBuffer`
   * become detached — recreate them here.
   *
   * **⚠️ Most plugins do NOT need this** — plugins using `PluginDataBus` are
   * immune to gwen-core's memory growth because their buffers live outside
   * the WASM linear memory.
   *
   * **⚠️ Currently NOT dispatched automatically** — you must call
   * `bridge.checkMemoryGrow()` manually in your `onStep()` if you cache views.
   *
   * **When to implement:**
   * - You cache a `TypedArray` view over `bridge.getLinearMemory().buffer`
   * - You use `SharedMemoryManager.allocateRegion()` and store views
   * - You are a debug tool that directly reads WASM linear memory
   *
   * @param newMemory The live `WebAssembly.Memory` object after the grow
   *   (the `.buffer` has already been replaced).
   *
   * @see {@link WasmBridge.checkMemoryGrow} for manual detection
   *
   * @example
   * ```typescript
   * private _view: Float32Array | null = null;
   *
   * onMemoryGrow(newMemory: WebAssembly.Memory) {
   *   if (this._region) {
   *     this._view = new Float32Array(newMemory.buffer, this._region.ptr, 10_000);
   *   }
   * }
   * ```
   */
  onMemoryGrow?(newMemory: WebAssembly.Memory): void;
}

// ── Unified plugin interface ──────────────────────────────────────────────────

/**
 * Unified GWEN plugin interface.
 *
 * A plugin is any object that participates in the engine's game loop.
 * Pure TypeScript plugins omit `wasm`; plugins that embed a Rust/WASM module
 * add a `wasm` sub-object describing the WASM runtime needs.
 *
 * **Type parameters**
 * - `N` — literal plugin name (e.g. `'InputPlugin'`). Used as the dedup key.
 * - `P` — service map this plugin registers in `api.services`.
 *   Values are *phantom types* (`{} as MyService`) — never read at runtime.
 * - `H` — custom hooks this plugin fires. Also a phantom type consumed by
 *   `gwen prepare` to enrich `GwenDefaultHooks`.
 *
 * **Frame order**
 * ```
 * onBeforeUpdate  →  (wasm.onStep)  →  onUpdate  →  onRender
 * ```
 *
 * @example TS-only plugin
 * ```ts
 * class InputPlugin implements GwenPlugin<'InputPlugin', InputServices> {
 *   readonly name = 'InputPlugin' as const;
 *   readonly provides = { keyboard: {} as KeyboardInput };
 *   onInit(api) { api.services.register('keyboard', new KeyboardInput()); }
 *   onBeforeUpdate() { this.keyboard.update(); }
 * }
 * ```
 *
 * @example WASM plugin
 * ```ts
 * class Physics2DPlugin implements GwenPlugin<'Physics2D', { physics: Physics2DAPI }> {
 *   readonly name = 'Physics2D' as const;
 *   readonly provides = { physics: {} as Physics2DAPI };
 *   readonly wasm: GwenPluginWasmContext = { id: 'physics2d', onInit: async (...) => { ... } };
 * }
 * ```
 */
export interface GwenPlugin<
  N extends string = string,
  P extends Record<string, unknown> = Record<string, unknown>,
  H extends Record<string, any> = Record<string, any>,
> {
  // ── Identity ────────────────────────────────────────────────────────────────

  /** Unique plugin name — used for dedup checks and `engine.getSystem()` lookup. */
  readonly name: N;

  /** Static metadata for gwen CLI tools. */
  readonly meta?: import('../plugin-system/plugin').GwenPluginMeta;

  /** Semver-compatible version string (optional, for debug overlay). */
  readonly version?: string;

  /**
   * Static query descriptor — when declared, a `QueryResult` is resolved
   * each frame and injected as the third argument to `onUpdate`.
   *
   * Short form: `ComponentDef[]` — treated as `{ all: [...] }`.
   *
   * @example
   * ```ts
   * query: [Position, Velocity]
   * // or
   * query: { all: [Position], none: [Frozen] }
   * ```
   */
  readonly query?: SystemQuery;

  /**
   * Plugin names that must be registered before this one.
   *
   * `PluginManager.register()` throws immediately if any listed name is not yet
   * registered, surfacing dependency errors at registration time instead of inside
   * `onInit` where they would produce harder-to-diagnose runtime failures.
   *
   * @example
   * ```ts
   * readonly dependencies = ['Physics2D'] as const;
   * ```
   */
  readonly dependencies?: readonly string[];

  /**
   * Services this plugin registers in `api.services`.
   *
   * Phantom type — values are never read at runtime. Set them to
   * `{} as MyServiceType` so TypeScript can infer the service shape.
   *
   * @example
   * ```ts
   * readonly provides = { physics: {} as Physics2DAPI };
   * ```
   */
  readonly provides?: P;

  /**
   * Custom hooks this plugin fires via `api.hooks.callHook(...)`.
   *
   * Phantom type — consumed by `gwen prepare` to enrich `GwenDefaultHooks`.
   * Set to `{} as MyHooks`.
   *
   * @example
   * ```ts
   * readonly providesHooks = {} as { 'physics:collision': (e: CollisionEvent) => void };
   * ```
   */
  readonly providesHooks?: H;

  // ── WASM extension (optional) ────────────────────────────────────────────────

  /**
   * WASM runtime context.
   *
   * When present, `createEngine()` routes this plugin through the async WASM
   * initialisation pipeline (prefetch → onInit → register) and calls
   * `wasm.onStep` every frame before `onUpdate`.
   *
   * When absent, the plugin is treated as a pure TypeScript plugin.
   */
  readonly wasm?: GwenPluginWasmContext;

  // ── TypeScript lifecycle (shared by both families) ───────────────────────────

  /**
   * Called once when the plugin is registered.
   * Set up services, subscribe to hooks, and initialise internal state here.
   *
   * For WASM plugins, `onInit` runs **after** `wasm.onInit` completes, so
   * services registered during the WASM phase are already available here.
   *
   * @param api Active engine API.
   */
  onInit?(api: EngineAPI): void;

  /**
   * Called at the very start of each frame, before the WASM simulation step.
   * Read raw inputs and set per-frame intentions here.
   *
   * @param api       Active engine API.
   * @param deltaTime Frame delta time in seconds (capped at 0.1 s).
   */
  onBeforeUpdate?(api: EngineAPI, deltaTime: number): void;

  /**
   * Called after the WASM step — apply game logic on the updated simulation state.
   *
   * If a `query` descriptor is declared on the plugin/system, the resolved
   * `QueryResult` is injected as the third argument.
   *
   * @param api       Active engine API.
   * @param deltaTime Frame delta time in seconds (capped at 0.1 s).
   * @param entities  Query result — only provided when `query` is declared.
   */
  onUpdate?(api: EngineAPI, deltaTime: number, entities?: QueryResult): void;

  /**
   * Called at the end of each frame — draw, update DOM, sync UI.
   * All component state written during `onUpdate` is visible here.
   *
   * @param api Active engine API.
   */
  onRender?(api: EngineAPI): void;

  /**
   * Called when the plugin is removed or the engine stops.
   * Cancel animation frames, remove event listeners, free resources.
   */
  onDestroy?(): void;
}

// ── Plugin entry ──────────────────────────────────────────────────────────────

/**
 * A plugin entry as declared in `Scene.systems[]`.
 *
 * Accepts either:
 * - a direct `GwenPlugin` instance (stateless systems / singletons)
 * - a no-arg factory `() => GwenPlugin` (systems with private closure state)
 *
 * `SceneManager` resolves factories automatically when the scene activates.
 *
 * @example
 * ```ts
 * // Direct object — no local state
 * systems: [MovementSystem]
 *
 * // Factory — private timer, counters, etc.
 * systems: [SpawnerSystem]   // SpawnerSystem is () => GwenPlugin
 * ```
 */
export type PluginEntry = GwenPlugin | (() => GwenPlugin);

// ── Aliases ──────────────────────────────────────────────────────────────────

/**
 * WASM-capable plugin alias.
 */
export type GwenWasmPlugin = GwenPlugin & { readonly wasm: GwenPluginWasmContext };
