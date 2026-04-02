/**
 * @file RFC-001 / RFC-008 — GwenEngine interface & createEngine() factory
 *
 * Provides the new `createEngine(options?) → Promise<GwenEngine>` API
 * described in RFC-001. Internally delegates to the existing `Engine` class
 * so no existing behaviour is changed.
 *
 * RFC-008 adds: 8-phase frame loop, `WasmModuleHandle`, `loadWasmModule`,
 * `getWasmModule`, and `startExternal` for external-loop integration.
 */

import { createHooks, type Hookable } from 'hookable';
import type { GwenRuntimeHooks } from './runtime-hooks.js';
import { engineContext } from '../context.js';
import { WasmRegionView, WasmRingBuffer } from './wasm-module-handle.js';
export type {
  WasmMemoryRegion,
  WasmMemoryOptions,
  WasmChannelOptions,
} from './wasm-module-handle.js';
export { WasmRegionView, WasmRingBuffer } from './wasm-module-handle.js';

// ─── WASM module types (RFC-008) ─────────────────────────────────────────────

/**
 * Options for loading a community WASM module via {@link GwenEngine.loadWasmModule}.
 *
 * @template Exports - Shape of the module's exported functions/memories.
 *
 * @example
 * ```typescript
 * const handle = await engine.loadWasmModule<{ step: (dt: number) => void }>({
 *   name: 'myMod',
 *   url: new URL('./my-mod.wasm', import.meta.url),
 *   step: (h, dt) => (h.exports as { step: (dt: number) => void }).step(dt),
 * })
 * ```
 */
export interface WasmModuleOptions<Exports extends WebAssembly.Exports = WebAssembly.Exports> {
  /** Unique name used to retrieve the module later via {@link GwenEngine.getWasmModule}. */
  readonly name: string;
  /** URL of the `.wasm` binary. Accepts a `URL` object or a string. */
  readonly url: URL | string;
  /**
   * Named memory regions to expose via `handle.region(name)`.
   * Each region creates a {@link WasmRegionView} backed by WASM linear memory.
   */
  readonly memory?: { regions: import('./wasm-module-handle.js').WasmMemoryRegion[] };
  /**
   * Ring-buffer channels for TS↔WASM message passing.
   * Each channel creates a {@link WasmRingBuffer} accessible via `handle.channel(name)`.
   */
  readonly channels?: import('./wasm-module-handle.js').WasmChannelOptions[];
  /**
   * Optional per-frame step callback.
   * Called during Phase 4 of every frame with the live handle and delta time in milliseconds.
   * @param handle - The live module handle with typed exports and memory.
   * @param dt - Delta time in milliseconds since the last frame.
   */
  readonly step?: (handle: WasmModuleHandle<Exports>, dt: number) => void;
}

/**
 * A live, typed handle to a loaded WASM module.
 * Provides access to exports and, when present, the module's linear memory.
 *
 * @template Exports - Shape of the module's exported functions/memories.
 *
 * @example
 * ```typescript
 * const handle = engine.getWasmModule<{ update: () => void }>('myMod')
 * handle.exports.update()
 * if (handle.memory) {
 *   const view = new Float32Array(handle.memory.buffer)
 * }
 * ```
 */
export interface WasmModuleHandle<Exports extends WebAssembly.Exports = WebAssembly.Exports> {
  /** The unique name this module was registered under. */
  readonly name: string;
  /** Typed exports from the instantiated WASM module. */
  readonly exports: Exports;
  /**
   * The module's linear memory export, if the WASM binary exports `"memory"`.
   * `undefined` when the binary does not export memory.
   *
   * @remarks
   * After `memory.grow()`, all `TypedArray` views backed by `memory.buffer` are
   * detached. Always create a fresh view per access and never cache it across frames.
   */
  readonly memory: WebAssembly.Memory | undefined;
  /**
   * Returns a live typed view accessor for a named memory region.
   * Throws if the region was not declared in `WasmModuleOptions.memory.regions`.
   *
   * @param regionName - The name declared in the module options.
   * @returns A {@link WasmRegionView} backed by WASM linear memory.
   */
  region(regionName: string): WasmRegionView;
  /**
   * Returns the ring-buffer channel with the given name.
   * Throws if the channel was not declared in `WasmModuleOptions.channels`.
   *
   * @param channelName - The name declared in the module options.
   * @returns A {@link WasmRingBuffer} for TS↔WASM message passing.
   */
  channel(channelName: string): WasmRingBuffer;
}

// ─── Public interfaces ───────────────────────────────────────────────────────

/**
 * Configuration options for {@link createEngine}.
 * All fields are optional — unspecified fields fall back to engine defaults.
 */
export interface GwenEngineOptions {
  /**
   * Maximum number of simultaneously alive entities.
   * Used at WASM init time to pre-allocate storage.
   * @default 10_000
   */
  maxEntities?: number;

  /**
   * Target frames per second for the internal RAF game loop.
   * Ignored when using an external loop via {@link GwenEngine.advance}.
   * @default 60
   */
  targetFPS?: number;

  /**
   * Maximum delta time in seconds. Prevents spiral-of-death after tab suspension.
   * @default 0.1
   */
  maxDeltaSeconds?: number;

  /**
   * WASM variant to load.
   * @default 'light'
   */
  variant?: 'light' | 'physics2d' | 'physics3d';
}

/**
 * Augmentable interface for the typed provide/inject registry.
 * Plugin packages extend this via declaration merging.
 *
 * @example
 * ```typescript
 * // In @gwenjs/physics2d:
 * declare module '@gwenjs/core' {
 *   interface GwenProvides {
 *     physics2d: Physics2DAPI
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface GwenProvides {}

/**
 * Options object accepted by the {@link GwenPluginNotFoundError} constructor.
 * Use this form when constructing the error from plugin composables.
 */
export interface GwenPluginNotFoundErrorOptions {
  /** The npm package name of the missing plugin. */
  pluginName: string;
  /** Human-readable hint explaining how to fix the issue. */
  hint: string;
  /** URL to the plugin's documentation. */
  docsUrl: string;
}

/**
 * Thrown when a required plugin/service has not been registered with the engine.
 *
 * Provides an actionable error message with a hint for fixing the problem
 * and a link to the plugin documentation.
 *
 * @example Using positional arguments (legacy / internal usage):
 * ```typescript
 * throw new GwenPluginNotFoundError(
 *   'physics2d',
 *   'Call engine.use(physics2dPlugin()) before accessing this service.',
 *   'https://gwenengine.dev/docs/plugins'
 * )
 * ```
 *
 * @example Using options object (RFC-005 composable pattern):
 * ```typescript
 * throw new GwenPluginNotFoundError({
 *   pluginName: '@gwenjs/physics2d',
 *   hint: 'Add @gwenjs/physics2d to the modules array in gwen.config.ts',
 *   docsUrl: 'https://gwenengine.dev/modules/physics2d',
 * })
 * ```
 */
export class GwenPluginNotFoundError extends Error {
  /**
   * The service key (or package name) that was requested.
   * @deprecated Prefer {@link pluginName} — this field is kept for backward compatibility.
   */
  readonly plugin: string;
  /** The npm package name (or service key) of the missing plugin. */
  readonly pluginName: string;
  /** Human-readable hint explaining how to fix the issue. */
  readonly hint: string;
  /** URL to relevant documentation. */
  readonly docsUrl: string;

  constructor(
    pluginOrOpts: string | GwenPluginNotFoundErrorOptions,
    hint?: string,
    docsUrl?: string,
  ) {
    const name = typeof pluginOrOpts === 'string' ? pluginOrOpts : pluginOrOpts.pluginName;
    const h = typeof pluginOrOpts === 'string' ? (hint ?? '') : pluginOrOpts.hint;
    const d = typeof pluginOrOpts === 'string' ? (docsUrl ?? '') : pluginOrOpts.docsUrl;

    super(`[GwenEngine] Plugin/service "${name}" not found. ${h}`);
    this.name = 'GwenPluginNotFoundError';
    this.plugin = name;
    this.pluginName = name;
    this.hint = h;
    this.docsUrl = d;
  }
}

/**
 * A GWEN plugin. Registered via {@link GwenEngine.use}.
 *
 * @example
 * ```typescript
 * const myPlugin: GwenPlugin = {
 *   name: 'my-plugin',
 *   setup(engine) {
 *     engine.provide('myService', new MyService())
 *   },
 *   onUpdate(dt) { ... },
 * }
 * ```
 */
export interface GwenPlugin {
  /** Unique plugin identifier. Used for deduplication and lookup. */
  name: string;
  /** Called once when the plugin is registered via `engine.use()`. */
  setup(engine: GwenEngine): void | Promise<void>;
  /** Called when the plugin is removed via `engine.unuse()`. */
  teardown?(): void | Promise<void>;
  /** Called every frame before physics/WASM step. */
  onBeforeUpdate?(dt: number): void;
  /** Called every frame after the WASM step. */
  onUpdate?(dt: number): void;
  /** Called every frame after `onUpdate`. */
  onAfterUpdate?(dt: number): void;
  /** Called every frame at the render phase. */
  onRender?(): void;
}

/**
 * Runtime statistics snapshot.
 */
export interface EngineStats {
  fps: number;
  deltaTime: number;
  frameCount: number;
}

/**
 * The GWEN engine instance returned by {@link createEngine}.
 *
 * @example Standalone (no framework)
 * ```typescript
 * import { createEngine } from '@gwenjs/core'
 * const engine = await createEngine({ maxEntities: 5_000 })
 * await engine.use(MyPlugin())
 * engine.start()
 * ```
 */
export interface GwenEngine {
  // ─── Plugin runner ──────────────────────────────────────────────────────
  /** Register and initialise a plugin. Deduplicates by `plugin.name`. */
  use(plugin: GwenPlugin): Promise<void>;
  /** Tear down and unregister a plugin by name. Safe to call with unknown names. */
  unuse(name: string): Promise<void>;

  // ─── Typed provide/inject ───────────────────────────────────────────────
  /** Register a named value in the typed service registry. */
  provide<K extends keyof GwenProvides>(key: K, value: GwenProvides[K]): void;
  /** Retrieve a value from the registry, throwing {@link GwenPluginNotFoundError} if absent. */
  inject<K extends keyof GwenProvides>(key: K): GwenProvides[K];
  /** Retrieve a value from the registry, returning `undefined` if absent. */
  tryInject<K extends keyof GwenProvides>(key: K): GwenProvides[K] | undefined;

  // ─── WASM bridge stub ───────────────────────────────────────────────────
  /** Low-level WASM bridge. Physics2D/3D filled in by RFC-009. */
  readonly wasmBridge: {
    physics2d: {
      enabled: boolean;
      enable(opts: unknown): void;
      disable(): void;
      step(dt: number): void;
    };
    physics3d: {
      enabled: boolean;
      enable(opts: unknown): void;
      disable(): void;
      step(dt: number): void;
    };
  };

  // ─── Context (unctx — RFC-005) ──────────────────────────────────────────
  /** Execute `fn` within this engine's context. `useEngine()` resolves inside `fn`. */
  run<T>(fn: () => T): T;
  /** Set this engine as the global active context. */
  activate(): void;
  /** Clear this engine from the active context. */
  deactivate(): void;

  // ─── Lifecycle ──────────────────────────────────────────────────────────
  /** Initialise all plugins and start the RAF loop. */
  start(): Promise<void>;
  /** Stop the RAF loop and tear down all plugins. */
  stop(): Promise<void>;
  /**
   * Start the engine without launching a RAF loop.
   * Use this when an external host (e.g. React Three Fiber's `useFrame`, a
   * test harness) drives the loop and calls {@link GwenEngine.advance} manually.
   *
   * @example
   * ```typescript
   * await engine.startExternal()
   * useFrame(({ clock }) => engine.advance(clock.getDelta() * 1000))
   * ```
   */
  startExternal(): Promise<void>;
  /**
   * Manually advance one tick (external loop mode).
   * Delta time in **milliseconds** is capped at `maxDeltaSeconds * 1000`.
   * Throws if called re-entrantly.
   * @param dt - Delta time in **milliseconds** since the last frame.
   */
  advance(dt: number): Promise<void>;

  // ─── WASM modules (RFC-008) ──────────────────────────────────────────────
  /**
   * Fetch and instantiate a community WASM module (Cas B).
   * Registers it under `options.name` and returns a typed handle.
   * Calling twice with the same name returns the same handle without re-fetching.
   *
   * @param options - Load options including URL and optional per-frame step.
   * @returns A live {@link WasmModuleHandle} with typed exports and memory access.
   * @throws {Error} If the fetch or instantiation fails.
   *
   * @example
   * ```typescript
   * const handle = await engine.loadWasmModule({
   *   name: 'audio',
   *   url: new URL('./audio.wasm', import.meta.url),
   *   step: (h, dt) => (h.exports as { tick: (dt: number) => void }).tick(dt),
   * })
   * ```
   */
  loadWasmModule<Exports extends WebAssembly.Exports = WebAssembly.Exports>(
    options: WasmModuleOptions<Exports>,
  ): Promise<WasmModuleHandle<Exports>>;
  /**
   * Retrieve a previously loaded WASM module by name.
   *
   * @param name - The name used when calling {@link GwenEngine.loadWasmModule}.
   * @returns The live {@link WasmModuleHandle}.
   * @throws {Error} If no module with the given name has been loaded.
   *
   * @example
   * ```typescript
   * const audio = engine.getWasmModule<AudioExports>('audio')
   * audio.exports.playSound(42)
   * ```
   */
  getWasmModule<Exports extends WebAssembly.Exports = WebAssembly.Exports>(
    name: string,
  ): WasmModuleHandle<Exports>;

  // ─── ECS (RFC-005) ──────────────────────────────────────────────────────
  /**
   * Create a live query over the ECS world. Called by `useQuery()`.
   * Returns an iterable that reflects the current set of matching entities.
   *
   * @param components - Component selectors to match against.
   * @returns A live iterable of matching entity data.
   */
  createLiveQuery(components: unknown[]): Iterable<unknown>;

  // ─── Hooks ──────────────────────────────────────────────────────────────
  /** Typed hookable lifecycle instance. */
  readonly hooks: Hookable<GwenRuntimeHooks>;

  // ─── Config ─────────────────────────────────────────────────────────────
  readonly maxEntities: number;
  readonly targetFPS: number;
  readonly maxDeltaSeconds: number;
  readonly variant: 'light' | 'physics2d' | 'physics3d';

  // ─── Stats ──────────────────────────────────────────────────────────────
  readonly deltaTime: number;
  readonly frameCount: number;
  getFPS(): number;
  getStats(): EngineStats;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Scoped hooks tracker — records (event, fn) pairs per plugin so they can be
 * bulk-removed when a plugin is unregistered.
 * @internal
 */
class ScopedHooksTracker {
  private _map = new Map<string, Array<{ event: string; fn: (...args: unknown[]) => unknown }>>();

  track(pluginName: string, event: string, fn: (...args: unknown[]) => unknown): void {
    if (!this._map.has(pluginName)) this._map.set(pluginName, []);
    this._map.get(pluginName)!.push({ event, fn });
  }

  removeAll(pluginName: string, hooks: Hookable<GwenRuntimeHooks>): void {
    const entries = this._map.get(pluginName);
    if (!entries) return;
    for (const { event, fn } of entries) {
      hooks.removeHook(event as keyof GwenRuntimeHooks, fn as never);
    }
    this._map.delete(pluginName);
  }

  clearAll(hooks: Hookable<GwenRuntimeHooks>): void {
    for (const pluginName of this._map.keys()) {
      this.removeAll(pluginName, hooks);
    }
  }
}

class GwenEngineImpl implements GwenEngine {
  // ─── Config ──────────────────────────────────────────────────────────────
  readonly maxEntities: number;
  readonly targetFPS: number;
  readonly maxDeltaSeconds: number;
  readonly variant: 'light' | 'physics2d' | 'physics3d';

  // ─── Internal state ───────────────────────────────────────────────────────
  private readonly _plugins: GwenPlugin[] = [];
  private readonly _pluginNames = new Set<string>();
  private readonly _services = new Map<string, unknown>();
  private readonly _tracker = new ScopedHooksTracker();
  private _advancing = false;
  private _deltaTime = 0;
  private _running = false;
  private _rafHandle = 0;
  private _lastFrameTime = 0;

  // ─── WASM module registry (RFC-008) ───────────────────────────────────────
  /**
   * Map of loaded WASM module entries keyed by name.
   * Each entry holds the public handle and the optional per-frame step function.
   * @internal
   */
  private readonly _wasmModules = new Map<
    string,
    {
      handle: WasmModuleHandle<WebAssembly.Exports>;
      step?: (handle: WasmModuleHandle<WebAssembly.Exports>, dt: number) => void;
    }
  >();

  // ─── Frame stats (RFC-008) ────────────────────────────────────────────────
  /**
   * Frame counter driven exclusively by `_runFrame` calls.
   * @internal
   */
  private _frameCountOwn = 0;
  /** Most recent FPS estimate: `1000 / dt` computed after each frame. @internal */
  private _fps = 0;

  // ─── Hooks ───────────────────────────────────────────────────────────────
  readonly hooks: Hookable<GwenRuntimeHooks> = createHooks<GwenRuntimeHooks>();

  // ─── WASM bridge stub ─────────────────────────────────────────────────────
  readonly wasmBridge = {
    physics2d: {
      enabled: false,
      enable(_opts: unknown) {
        this.enabled = true;
      },
      disable() {
        this.enabled = false;
      },
      step(_dt: number) {},
    },
    physics3d: {
      enabled: false,
      enable(_opts: unknown) {
        this.enabled = true;
      },
      disable() {
        this.enabled = false;
      },
      step(_dt: number) {},
    },
  };

  constructor(opts: GwenEngineOptions) {
    this.maxEntities = opts.maxEntities ?? 10_000;
    this.targetFPS = opts.targetFPS ?? 60;
    this.maxDeltaSeconds = opts.maxDeltaSeconds ?? 0.1;
    this.variant = opts.variant ?? 'light';
  }

  // ─── Plugin runner ────────────────────────────────────────────────────────

  async use(plugin: GwenPlugin): Promise<void> {
    if (this._pluginNames.has(plugin.name)) return;

    const scopedHooks = this._createScopedHooks(plugin.name);
    const engineWithScopedHooks = this._withScopedHooks(scopedHooks);

    // Run setup inside engine context so useEngine() resolves to this instance.
    // engineContext.call() saves and restores the previous context (safe for nesting).
    const setupResult = engineContext.call(this, () => plugin.setup(engineWithScopedHooks));
    if (setupResult instanceof Promise) await setupResult;

    this._plugins.push(plugin);
    this._pluginNames.add(plugin.name);
    await this.hooks.callHook('plugin:registered', plugin.name);
  }

  async unuse(name: string): Promise<void> {
    const idx = this._plugins.findIndex((p) => p.name === name);
    if (idx === -1) return;

    const plugin = this._plugins[idx]!;
    await plugin.teardown?.();
    this._plugins.splice(idx, 1);
    this._pluginNames.delete(name);
    this._tracker.removeAll(name, this.hooks);
  }

  // ─── Typed provide/inject ─────────────────────────────────────────────────

  provide<K extends keyof GwenProvides>(key: K, value: GwenProvides[K]): void {
    this._services.set(key as string, value);
  }

  inject<K extends keyof GwenProvides>(key: K): GwenProvides[K] {
    if (!this._services.has(key as string)) {
      throw new GwenPluginNotFoundError(
        key as string,
        `Call engine.use(${key as string}Plugin()) before using this service.`,
        'https://gwenengine.dev/docs/plugins',
      );
    }
    return this._services.get(key as string) as GwenProvides[K];
  }

  tryInject<K extends keyof GwenProvides>(key: K): GwenProvides[K] | undefined {
    return this._services.get(key as string) as GwenProvides[K] | undefined;
  }

  // ─── Context (RFC-005) ────────────────────────────────────────────────────

  /**
   * Executes `fn` within this engine's context.
   * Composables (`useEngine()`, `usePhysics2D()`, etc.) resolve to this instance inside `fn`.
   *
   * @param fn - Synchronous function to execute in context
   * @returns The return value of `fn`
   *
   * @example
   * ```typescript
   * const instance = engine.run(() => useEngine())
   * // instance === engine ✓
   * ```
   */
  run<T>(fn: () => T): T {
    return engineContext.call(this, fn);
  }

  /**
   * Sets this engine as the globally active context instance.
   * Prefer {@link run} for scoped context management.
   * Use `activate()` / `deactivate()` only when you control the lifecycle manually
   * (e.g., a custom game loop outside `advance()`).
   */
  activate(): void {
    engineContext.set(this, true);
  }

  /**
   * Clears this engine from the active global context.
   * Must be called after {@link activate} when the frame is complete.
   */
  deactivate(): void {
    engineContext.unset();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;
    this._lastFrameTime = performance.now();

    await this.hooks.callHook('engine:init');
    await this.hooks.callHook('engine:start');

    // Own the RAF loop — call _runFrame each animation frame.
    const loop = async (now: number) => {
      if (!this._running) return;
      const rawDt = now - this._lastFrameTime;
      const dt = Math.min(rawDt, this.maxDeltaSeconds * 1000);
      this._lastFrameTime = now;
      this._deltaTime = dt;
      try {
        await this._runFrame(dt);
      } finally {
        if (this._running) this._rafHandle = requestAnimationFrame(loop);
      }
    };
    this._rafHandle = requestAnimationFrame(loop);
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this._rafHandle) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = 0;
    }
    await this.hooks.callHook('engine:stop');
    this._tracker.clearAll(this.hooks);
  }

  /**
   * Initialise the engine for an externally driven loop.
   * Fires `engine:init` and `engine:start` hooks without launching a RAF loop.
   * Call this once, then drive frames by calling `advance(dt)` each tick.
   *
   * @example
   * ```typescript
   * await engine.startExternal()
   * // In a game loop / R3F useFrame:
   * engine.advance(16.67)
   * ```
   */
  async startExternal(): Promise<void> {
    await this.hooks.callHook('engine:init');
    await this.hooks.callHook('engine:start');
    // Intentionally skip RAF — the caller drives the loop via advance().
  }

  async advance(dt: number): Promise<void> {
    if (this._advancing) {
      throw new Error('[GwenEngine] advance() called re-entrantly — only one advance per frame.');
    }
    this._advancing = true;
    // Cap dt (ms) at maxDeltaSeconds converted to ms to prevent spiral-of-death.
    const cappedDt = Math.min(dt, this.maxDeltaSeconds * 1000);
    this._deltaTime = cappedDt;
    try {
      await this._runFrame(cappedDt);
    } finally {
      this._advancing = false;
    }
  }

  // ─── WASM modules (RFC-008) ────────────────────────────────────────────────

  /**
   * Fetch and instantiate a WASM binary, then register it under `options.name`.
   * If a module with the same name is already loaded, returns the existing handle.
   *
   * @param options - Load options: name, URL, and optional per-frame step.
   * @returns The typed {@link WasmModuleHandle}.
   * @throws {Error} If `fetch` or `WebAssembly.instantiate` fails.
   */
  async loadWasmModule<Exports extends WebAssembly.Exports = WebAssembly.Exports>(
    options: WasmModuleOptions<Exports>,
  ): Promise<WasmModuleHandle<Exports>> {
    // Deduplication — same name returns existing handle without re-fetching.
    const existing = this._wasmModules.get(options.name);
    if (existing) {
      return existing.handle as WasmModuleHandle<Exports>;
    }

    let instance: WebAssembly.Instance;
    try {
      const response = await fetch(
        options.url instanceof URL ? options.url.toString() : options.url,
      );
      if (!response.ok) {
        throw new Error(
          `[GWEN] loadWasmModule("${options.name}"): fetch failed with status ${response.status} ${response.statusText}.`,
        );
      }
      const buffer = await response.arrayBuffer();
      const result = await WebAssembly.instantiate(buffer, {});
      instance = result.instance;
    } catch (err) {
      throw new Error(
        `[GWEN] loadWasmModule("${options.name}"): failed to load WASM module from "${options.url}". ` +
          `Cause: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const memory =
      instance.exports['memory'] instanceof WebAssembly.Memory
        ? instance.exports['memory']
        : undefined;

    // Build region and channel maps from options.
    const regionMap = new Map((options.memory?.regions ?? []).map((r) => [r.name, r]));
    const channelMap = new Map(
      (options.channels ?? []).map((c) => [
        c.name,
        new WasmRingBuffer(memory ?? new WebAssembly.Memory({ initial: 1 }), c),
      ]),
    );

    const handle: WasmModuleHandle<Exports> = {
      name: options.name,
      exports: instance.exports as Exports,
      memory,
      region(regionName: string): WasmRegionView {
        const def = regionMap.get(regionName);
        if (!def) {
          throw new Error(
            `[GWEN] WASM region '${regionName}' not found in module '${options.name}'. ` +
              `Declare it in WasmModuleOptions.memory.regions.`,
          );
        }
        if (!memory) {
          throw new Error(
            `[GWEN] WASM module '${options.name}' does not export memory — cannot create region view.`,
          );
        }
        return new WasmRegionView(memory, def);
      },
      channel(channelName: string): WasmRingBuffer {
        const ch = channelMap.get(channelName);
        if (!ch) {
          throw new Error(
            `[GWEN] WASM channel '${channelName}' not found in module '${options.name}'. ` +
              `Declare it in WasmModuleOptions.channels.`,
          );
        }
        return ch;
      },
    };

    this._wasmModules.set(options.name, {
      handle: handle as WasmModuleHandle<WebAssembly.Exports>,
      // Cast through unknown to satisfy the Map's invariant generic type.
      step: options.step as
        | ((handle: WasmModuleHandle<WebAssembly.Exports>, dt: number) => void)
        | undefined,
    });

    return handle;
  }

  /**
   * Retrieve a previously loaded WASM module handle by name.
   *
   * @param name - The name supplied to {@link loadWasmModule}.
   * @returns The typed {@link WasmModuleHandle}.
   * @throws {Error} If no module has been loaded under `name`.
   */
  getWasmModule<Exports extends WebAssembly.Exports = WebAssembly.Exports>(
    name: string,
  ): WasmModuleHandle<Exports> {
    const entry = this._wasmModules.get(name);
    if (!entry) {
      throw new Error(
        `[GWEN] getWasmModule("${name}"): no WASM module loaded under that name. ` +
          `Call engine.loadWasmModule({ name: "${name}", url: ... }) first.`,
      );
    }
    return entry.handle as WasmModuleHandle<Exports>;
  }

  /** Returns an empty live query (ECS integration pending — RFC-006). */
  createLiveQuery(_components: unknown[]): Iterable<unknown> {
    return [][Symbol.iterator]();
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  get deltaTime(): number {
    return this._deltaTime;
  }
  /** Frame counter — increments by 1 for each completed `_runFrame` call. */
  get frameCount(): number {
    return this._frameCountOwn;
  }
  /** Most recent FPS estimate. Updated after every frame as `1000 / dt`. */
  getFPS(): number {
    return this._fps;
  }
  getStats(): EngineStats {
    return {
      fps: this._fps,
      deltaTime: this._deltaTime,
      frameCount: this._frameCountOwn,
    };
  }

  // ─── 8-phase frame runner ─────────────────────────────────────────────────

  private async _runFrame(dt: number): Promise<void> {
    // All 8 frame phases run inside this engine's context.
    // engineContext.set(this, true) makes useEngine() resolve to this instance
    // for the entire duration of the frame (across await points).
    // The _advancing guard (set before _runFrame is called) prevents re-entrance,
    // so it is safe to use set/unset here instead of call() for async compatibility.
    engineContext.set(this, true);
    try {
      // Phase 1 — engine:tick hook (fires before any plugin work)
      await this.hooks.callHook('engine:tick', dt);

      // Phase 2 — onBeforeUpdate (all plugins, registration order)
      for (const plugin of this._plugins) {
        plugin.onBeforeUpdate?.(dt);
      }

      // Phase 3 — built-in physics step (Cas A: wasmBridge physics)
      if (this.wasmBridge.physics2d.enabled) this.wasmBridge.physics2d.step(dt);
      if (this.wasmBridge.physics3d.enabled) this.wasmBridge.physics3d.step(dt);

      // Phase 4 — community WASM modules step (Cas B: user WASM, registration order)
      for (const entry of this._wasmModules.values()) {
        entry.step?.(entry.handle, dt);
      }

      // Phase 5 — ECS query flush (dirty component marks resolved)
      // Handled internally by the WASM core; stub for future explicit flush API.

      // Phase 6 — onUpdate (all plugins, registration order)
      for (const plugin of this._plugins) {
        plugin.onUpdate?.(dt);
      }

      // Phase 7 — onAfterUpdate + onRender (all plugins, registration order)
      for (const plugin of this._plugins) {
        plugin.onAfterUpdate?.(dt);
      }
      for (const plugin of this._plugins) {
        plugin.onRender?.();
      }

      // Phase 8 — update stats, then fire engine:afterTick hook
      this._frameCountOwn++;
      this._fps = dt > 0 ? 1000 / dt : 0;
      await this.hooks.callHook('engine:afterTick', dt);
    } finally {
      engineContext.unset();
    }
  }

  // ─── Scoped hooks proxy ───────────────────────────────────────────────────

  private _createScopedHooks(pluginName: string): Hookable<GwenRuntimeHooks> {
    const tracker = this._tracker;
    const realHooks = this.hooks;
    return new Proxy(realHooks, {
      get(target, prop) {
        if (prop === 'hook') {
          return (event: string, fn: (...args: unknown[]) => unknown) => {
            tracker.track(pluginName, event, fn);
            return (target as unknown as Record<string, unknown>)['hook'] instanceof Function
              ? (target.hook as (e: string, f: (...args: unknown[]) => unknown) => void)(
                  event as keyof GwenRuntimeHooks,
                  fn as never,
                )
              : undefined;
          };
        }
        return Reflect.get(target, prop);
      },
    });
  }

  private _withScopedHooks(scopedHooks: Hookable<GwenRuntimeHooks>): GwenEngine {
    return new Proxy(this, {
      get(target, prop) {
        if (prop === 'hooks') return scopedHooks;
        return Reflect.get(target, prop);
      },
    });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a GWEN engine instance.
 *
 * @param options - Engine configuration. All fields optional.
 * @returns A fully initialised {@link GwenEngine}.
 *
 * @example
 * ```typescript
 * import { createEngine } from '@gwenjs/core'
 * const engine = await createEngine({ maxEntities: 5_000, variant: 'physics2d' })
 * await engine.use(myPlugin())
 * engine.start()
 * ```
 */
export async function createEngine(options?: GwenEngineOptions): Promise<GwenEngine> {
  return new GwenEngineImpl(options ?? {});
}
