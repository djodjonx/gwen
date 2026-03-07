/**
 * @file definePlugin — unified plugin factory for GWEN.
 *
 * A single `definePlugin()` function covers both plugin families:
 *
 * - **TS-only plugin** — omit the `wasm` key in the definition.
 * - **WASM plugin**    — include a `wasm` key; its presence is detected at
 *   runtime by `isWasmPlugin()` inside `createEngine()`.
 *
 * Both overloads return a **class constructor** so `new MyPlugin(options)`
 * works exactly like a hand-written class, with the same `instanceof` semantics.
 *
 * @example TS-only plugin
 * ```ts
 * import { definePlugin } from '@gwen/kit';
 *
 * export const AudioPlugin = definePlugin({
 *   name: 'AudioPlugin',
 *   provides: { audio: {} as AudioManager },
 *   setup(options: { masterVolume?: number } = {}) {
 *     let ctx: AudioContext;
 *     return {
 *       onInit(api) {
 *         ctx = new AudioContext();
 *         api.services.register('audio', new AudioManager(ctx, options.masterVolume));
 *       },
 *       onDestroy() { ctx.close(); },
 *     };
 *   },
 * });
 *
 * // Usage in gwen.config.ts
 * plugins: [new AudioPlugin({ masterVolume: 0.8 })]
 * ```
 *
 * @example WASM plugin
 * ```ts
 * import { definePlugin, loadWasmPlugin } from '@gwen/kit';
 *
 * export const Physics2DPlugin = definePlugin({
 *   name: 'Physics2D',
 *   provides: { physics: {} as Physics2DAPI },
 *   wasm: {
 *     id: 'physics2d',
 *     channels: [
 *       { name: 'transform', direction: 'read', strideBytes: 20, bufferType: 'f32' },
 *       { name: 'events',    direction: 'write', bufferType: 'ring', capacityEvents: 256 },
 *     ],
 *   },
 *   setup(options: Physics2DConfig = {}) {
 *     let wasmPlugin: WasmPhysics2D | null = null;
 *     return {
 *       async onWasmInit(_bridge, _region, api, bus) {
 *         const wasm = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js' });
 *         wasmPlugin = new wasm.Physics2DPlugin(options.gravity ?? -9.81);
 *         api.services.register('physics', createAPI(wasmPlugin));
 *       },
 *       onStep(dt) { wasmPlugin?.step(dt); },
 *       onDestroy() { wasmPlugin?.free(); },
 *     };
 *   },
 * });
 * ```
 */

import type {
  GwenPlugin,
  GwenPluginWasmContext,
  EngineAPI,
  PluginChannel,
  WasmBridge,
  MemoryRegion,
  PluginDataBus,
} from '@gwen/engine-core';
import type { GwenPluginMeta } from '@gwen/engine-core';

// ── Lifecycle shapes ──────────────────────────────────────────────────────────

/**
 * Lifecycle callbacks returned by `setup()` for a TS-only plugin.
 *
 * All callbacks are optional — implement only what your plugin needs.
 */
export interface TsPluginLifecycle {
  /**
   * Called once when the plugin is registered with the engine.
   * Register services, subscribe to hooks, and initialize internal state here.
   *
   * @param api - The active engine API.
   */
  onInit?(api: EngineAPI): void;

  /**
   * Called at the very start of each frame, before the WASM simulation step.
   * Use this to read raw inputs and set per-frame state.
   *
   * @param api       - The active engine API.
   * @param deltaTime - Frame delta in seconds (capped at 0.1 s).
   */
  onBeforeUpdate?(api: EngineAPI, deltaTime: number): void;

  /**
   * Called after the WASM step — apply game logic on the updated simulation state.
   *
   * @param api       - The active engine API.
   * @param deltaTime - Frame delta in seconds (capped at 0.1 s).
   */
  onUpdate?(api: EngineAPI, deltaTime: number): void;

  /**
   * Called at the end of each frame for rendering and UI updates.
   *
   * @param api - The active engine API.
   */
  onRender?(api: EngineAPI): void;

  /**
   * Called when the plugin is removed or the engine stops.
   * Cancel animation frames, remove event listeners, free resources.
   */
  onDestroy?(): void;
}

/**
 * Lifecycle callbacks returned by `setup()` for a WASM plugin.
 *
 * Extends `TsPluginLifecycle` with additional WASM-specific hooks.
 * The TS lifecycle callbacks (`onInit`, `onUpdate`…) are also available
 * and run in the normal TS game-loop slot alongside the WASM step.
 */
export interface WasmPluginLifecycle extends TsPluginLifecycle {
  /**
   * Optional parallel pre-fetch.
   *
   * Called concurrently with other plugins' `prefetch()` before the sequential
   * `onWasmInit` phase. Cache the loaded WASM module internally to avoid a
   * redundant round-trip inside `onWasmInit`.
   */
  prefetch?(): Promise<void>;

  /**
   * Async WASM initialisation — called **once** by `createEngine()` before
   * `engine.start()`, in declaration order (sequential, not parallel).
   *
   * Responsibilities:
   * 1. Instantiate the `.wasm` binary (use the cached module from `prefetch`).
   * 2. Build typed-array views over the `bus` buffers.
   * 3. Register services via `api.services.register()`.
   *
   * @param bridge  - Active `WasmBridge` (gwen-core is already initialised).
   * @param region  - Pre-allocated SAB slice, or `null` when `sharedMemoryBytes === 0`.
   * @param api     - Engine API — call `api.services.register()` here.
   * @param bus     - Plugin Data Bus — call `bus.get(id, channelName)` for buffers.
   */
  onWasmInit(
    bridge: WasmBridge,
    region: MemoryRegion | null,
    api: EngineAPI,
    bus: PluginDataBus,
  ): Promise<void>;

  /**
   * Per-frame WASM simulation tick — called **before** `onUpdate`.
   * Run `this._wasmInstance.step(deltaTime)` here.
   *
   * @param deltaTime - Frame delta in seconds (capped at 0.1 s).
   */
  onStep?(deltaTime: number): void;

  /**
   * Memory-grow callback.
   * Fired when gwen-core's WASM linear memory grows. Recreate any detached
   * `TypedArray` / `DataView` views that point into the old `ArrayBuffer`.
   *
   * @param newMemory - The live `WebAssembly.Memory` after the grow.
   */
  onMemoryGrow?(newMemory: WebAssembly.Memory): void;
}

// ── Definition shapes ─────────────────────────────────────────────────────────

/**
 * Shared fields for both `definePlugin` overloads.
 * @internal
 */
interface BasePluginDefinition<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
  // oxlint-disable-next-line no-unused-vars
  Options,
> {
  /** Unique plugin name — literal type, used as the dedup key. */
  name: N;

  /**
   * Services this plugin registers in `api.services`.
   * Phantom type — values are `{} as MyService`, never read at runtime.
   */
  provides?: P;

  /**
   * Custom hooks this plugin fires.
   * Phantom type — consumed by `gwen prepare` to enrich `GwenDefaultHooks`.
   */
  providesHooks?: H;

  /**
   * Semver-compatible version string (optional, displayed in the debug overlay).
   */
  version?: string;

  /**
   * Static metadata consumed by `gwen prepare` to inject
   * `/// <reference types="..." />` directives into `.gwen/gwen.d.ts`.
   *
   * @example
   * ```ts
   * meta: { typeReferences: ['@my-org/my-plugin/vite-env'] }
   * ```
   */
  meta?: GwenPluginMeta;
}

/**
 * Definition shape for a **TS-only** plugin (no `wasm` key).
 */
export type TsPluginDefinition<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
  Options,
> = BasePluginDefinition<N, P, H, Options> & {
  wasm?: never;
  /**
   * Factory called once per `new MyPlugin(options)` invocation.
   *
   * - No options: `setup()` — no parameter.
   * - With options: `setup(options?: MyConfig)` or `setup(options: MyConfig = {})`.
   *
   * TypeScript infers `Options` directly from the parameter type.
   */
  setup(options?: Options): TsPluginLifecycle;
};

/**
 * WASM runtime metadata declared statically at the definition level.
 * These fields are shared across all instances of the plugin class.
 */
export interface WasmPluginStaticContext {
  /**
   * Unique WASM plugin identifier — used as the key for memory-region
   * allocation and Plugin Data Bus channels.
   */
  readonly id: string;

  /**
   * Bytes to reserve in the legacy shared transform buffer (SAB).
   * Set to `0` (default) to use only the Plugin Data Bus.
   *
   * @default 0
   */
  readonly sharedMemoryBytes?: number;

  /**
   * Channel declarations — one `ArrayBuffer` per entry is pre-allocated
   * by `PluginDataBus` before `onWasmInit` is called.
   */
  readonly channels?: PluginChannel[];
}

/**
 * Definition shape for a **WASM** plugin (has a `wasm` key).
 */
export interface WasmPluginDefinition<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
  Options,
> extends Omit<BasePluginDefinition<N, P, H, Options>, 'setup'> {
  /**
   * Static WASM context shared across all instances.
   * Its presence is the discriminant detected by `isWasmPlugin()`.
   */
  wasm: WasmPluginStaticContext;

  /**
   * Factory returning both WASM and TS lifecycle callbacks.
   * Called once per `new MyPlugin(options)` invocation.
   *
   * - No options: `setup()` — no parameter.
   * - With options: `setup(options?: MyConfig)` or `setup(options: MyConfig = {})`.
   *
   * TypeScript infers `Options` directly from the parameter type.
   */
  setup(options?: Options): WasmPluginLifecycle;
}

// ── Returned constructor type ─────────────────────────────────────────────────

/**
 * A concrete plugin instance produced by `definePlugin()`.
 *
 * Extends `GwenPlugin` with lifecycle methods guaranteed to be present
 * (non-optional) on every instance, even if the `setup()` closure does not
 * implement them — they safely no-op in that case.
 *
 * This gives plugin authors and test code a precise type:
 * `plugin.onInit(api)` compiles without needing `plugin.onInit!(api)`.
 */
export type ConcretePlugin<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
> = GwenPlugin<N, P, H> & {
  onInit(api: EngineAPI): void;
  onBeforeUpdate(api: EngineAPI, deltaTime: number): void;
  onUpdate(api: EngineAPI, deltaTime: number): void;
  onRender(api: EngineAPI): void;
  onDestroy(): void;
};

/**
 * The class constructor returned by `definePlugin()`.
 *
 * Instances are valid `GwenPlugin` objects accepted by `defineConfig({ plugins })`.
 * The generic `Options` is `void` when the plugin takes no options — `new MyPlugin()`.
 *
 * ## Typing an instance variable
 *
 * `definePlugin()` returns a **value** (a constructor), not a named type.
 * Use `InstanceType<typeof MyPlugin>` or the `GwenPluginInstance<T>` helper:
 *
 * ```ts
 * import type { GwenPluginInstance } from '@gwen/kit';
 *
 * let plugin: InstanceType<typeof AudioPlugin>;
 * // or equivalently:
 * let plugin: GwenPluginInstance<typeof AudioPlugin>;
 * ```
 */
export type PluginClass<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
  Options,
> = Options extends void
  ? { new (): ConcretePlugin<N, P, H> }
  : { new (options?: Options): ConcretePlugin<N, P, H> };

/**
 * Convenience type alias for the **instance** type of a plugin class returned
 * by `definePlugin()`.
 *
 * Because `definePlugin()` returns a constructor (a value, not a named type),
 * you cannot use the plugin const directly as a type annotation. Use this
 * helper instead of writing `InstanceType<typeof MyPlugin>` everywhere.
 *
 * @example
 * ```ts
 * import type { GwenPluginInstance } from '@gwen/kit';
 *
 * // In a test file or another plugin:
 * let plugin: GwenPluginInstance<typeof AudioPlugin>;
 * let ui: GwenPluginInstance<typeof HtmlUIPlugin>;
 * ```
 */
export type GwenPluginInstance<T extends abstract new (...args: any[]) => any> = InstanceType<T>;

// ── Overload 1 — TS-only plugin ───────────────────────────────────────────────

/**
 * Define a **TypeScript-only** GWEN plugin.
 *
 * Returns a class constructor. Instantiate with `new MyPlugin(options)` and
 * pass the instance into `defineConfig({ plugins: [...] })`.
 *
 * All private state lives in the `setup()` closure — no class fields needed.
 *
 * @param definition - Plugin definition without a `wasm` key.
 * @returns A plugin class constructor.
 *
 * @example
 * ```ts
 * import { definePlugin } from '@gwen/kit';
 *
 * // Plugin without options:
 * export const HudPlugin = definePlugin({
 *   name: 'HudPlugin',
 *   setup() {
 *     return { onInit(api) { ... } };
 *   },
 * });
 *
 * // Plugin with options:
 * export const ScorePlugin = definePlugin({
 *   name: 'ScorePlugin',
 *   provides: { score: {} as ScoreService },
 *   setup(opts: { initial?: number } = {}) {
 *     let total = opts.initial ?? 0;
 *     return {
 *       onInit(api) {
 *         api.services.register('score', {
 *           add: (n) => { total += n; },
 *           get: () => total,
 *         });
 *       },
 *     };
 *   },
 * });
 *
 * // Typing an instance variable:
 * import type { GwenPluginInstance } from '@gwen/kit';
 * let plugin: GwenPluginInstance<typeof ScorePlugin>;
 *
 * // gwen.config.ts
 * plugins: [new ScorePlugin({ initial: 0 })]
 * ```
 */
export function definePlugin<
  N extends string,
  Options,
  P extends Record<string, unknown> = Record<string, unknown>,
  H extends Record<string, any> = Record<string, any>,
>(definition: TsPluginDefinition<N, P, H, Options>): PluginClass<N, P, H, Options>;

// ── Overload 2 — WASM plugin ──────────────────────────────────────────────────

/**
 * Define a **WASM-backed** GWEN plugin.
 *
 * The `wasm` key in the definition declares the static WASM runtime context
 * (id, channels, sharedMemoryBytes). The `setup()` closure returns both WASM
 * lifecycle hooks (`onWasmInit`, `onStep`) and the standard TS hooks
 * (`onInit`, `onUpdate`, `onRender`, `onDestroy`).
 *
 * @param definition - Plugin definition with a `wasm` key.
 * @returns A plugin class constructor whose instances satisfy
 *          `GwenPlugin & { wasm: GwenPluginWasmContext }`.
 *
 * @example
 * ```ts
 * import { definePlugin, loadWasmPlugin } from '@gwen/kit';
 *
 * export const Physics2DPlugin = definePlugin({
 *   name: 'Physics2D',
 *   provides: { physics: {} as Physics2DAPI },
 *   wasm: {
 *     id: 'physics2d',
 *     channels: [
 *       { name: 'transform', direction: 'read', strideBytes: 20, bufferType: 'f32' },
 *       { name: 'events',    direction: 'write', bufferType: 'ring', capacityEvents: 256 },
 *     ],
 *   },
 *   setup(config: Physics2DConfig = {}) {
 *     let wasm: WasmPhysics2D | null = null;
 *     return {
 *       async onWasmInit(_bridge, _region, api, bus) {
 *         const mod = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js' });
 *         wasm = new mod.Physics2DPlugin(config.gravity ?? -9.81);
 *         api.services.register('physics', buildAPI(wasm));
 *       },
 *       onStep(dt) { wasm?.step(dt); },
 *       onDestroy() { wasm?.free(); },
 *     };
 *   },
 * });
 * ```
 */
export function definePlugin<
  N extends string,
  Options,
  P extends Record<string, unknown> = Record<string, unknown>,
  H extends Record<string, any> = Record<string, any>,
>(definition: WasmPluginDefinition<N, P, H, Options>): PluginClass<N, P, H, Options>;

// ── Implementation ────────────────────────────────────────────────────────────

export function definePlugin<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
  Options,
>(
  definition: TsPluginDefinition<N, P, H, Options> | WasmPluginDefinition<N, P, H, Options>,
): PluginClass<N, P, H, Options> {
  const isWasm = 'wasm' in definition && definition.wasm !== undefined;

  // Build the wasm context object once — shared across all instances
  const staticWasm: GwenPluginWasmContext | undefined = isWasm
    ? buildWasmContext(definition as WasmPluginDefinition<N, P, H, Options>)
    : undefined;

  // We build the wasm context lazily per-instance so that `onWasmInit` / `onStep`
  // can close over the per-instance `impl` (which holds the WASM instance pointer).
  // The static fields (id, sharedMemoryBytes, channels) are shared.

  class PluginInstance implements GwenPlugin<N, P, H> {
    readonly name: N;
    readonly version: string | undefined;
    readonly meta: import('@gwen/engine-core').GwenPluginMeta | undefined;
    readonly provides: P | undefined;
    readonly providesHooks: H | undefined;
    readonly wasm: GwenPluginWasmContext | undefined;

    private readonly _impl: TsPluginLifecycle | WasmPluginLifecycle;

    constructor(options?: Options) {
      this.name = definition.name;
      this.version = definition.version;
      this.meta = definition.meta;
      this.provides = definition.provides;
      this.providesHooks = definition.providesHooks;

      // Call setup() with the resolved options
      const resolvedOptions = (options ?? undefined) as Options;
      this._impl = (definition.setup as (o?: Options) => TsPluginLifecycle | WasmPluginLifecycle)(
        resolvedOptions,
      );

      // Build the per-instance wasm context (closes over _impl for callbacks)
      if (isWasm && staticWasm) {
        const impl = this._impl as WasmPluginLifecycle;
        this.wasm = {
          id: staticWasm.id,
          sharedMemoryBytes: staticWasm.sharedMemoryBytes,
          channels: staticWasm.channels,
          prefetch: impl.prefetch?.bind(impl),
          onInit: impl.onWasmInit.bind(impl),
          onStep: impl.onStep?.bind(impl),
          onMemoryGrow: impl.onMemoryGrow?.bind(impl),
        };
      }
    }

    onInit(api: EngineAPI): void {
      this._impl.onInit?.(api);
    }

    onBeforeUpdate(api: EngineAPI, deltaTime: number): void {
      this._impl.onBeforeUpdate?.(api, deltaTime);
    }

    onUpdate(api: EngineAPI, deltaTime: number): void {
      this._impl.onUpdate?.(api, deltaTime);
    }

    onRender(api: EngineAPI): void {
      this._impl.onRender?.(api);
    }

    onDestroy(): void {
      this._impl.onDestroy?.();
    }
  }

  // Set the class name for better debug output (plugin name visible in stack traces)
  Object.defineProperty(PluginInstance, 'name', { value: definition.name });

  return PluginInstance as unknown as PluginClass<N, P, H, Options>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Extract the static WASM fields (id, sharedMemoryBytes, channels) from a
 * WASM plugin definition. The per-instance callbacks are wired in the
 * constructor where they can close over `_impl`.
 */
function buildWasmContext<
  N extends string,
  P extends Record<string, unknown>,
  H extends Record<string, any>,
  Options,
>(def: WasmPluginDefinition<N, P, H, Options>): GwenPluginWasmContext {
  // Placeholder onInit — replaced per instance in the constructor
  const placeholder: GwenPluginWasmContext = {
    id: def.wasm.id,
    sharedMemoryBytes: def.wasm.sharedMemoryBytes ?? 0,
    channels: def.wasm.channels,
    // These are replaced per-instance; this object is only used for static field extraction
    onInit: () => Promise.resolve(),
  };
  return placeholder;
}
