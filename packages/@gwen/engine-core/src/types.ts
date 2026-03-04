/**
 * GWEN Engine Type Definitions
 *
 * Core types — framework agnostic, no rendering concerns.
 */

// ============= Core Types =============

export type EntityId = number;

export interface Vector2D {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ============= Component System =============

export type ComponentType = string;

export interface ComponentAccessor<T> {
  /** Get component data for an entity */
  get(entityId: EntityId): T | undefined;
  /** Set / update component data */
  set(entityId: EntityId, data: T): void;
  /** Check presence */
  has(entityId: EntityId): boolean;
  /** Remove component */
  remove(entityId: EntityId): boolean;
}

// ============= Global Service Registry =============

/**
 * Global service registry interface — augmented by `gwen prepare`.
 *
 * This interface is empty by default (safe fallback).
 * When the developer runs `gwen prepare` (or `gwen dev` / `gwen build`),
 * the generated `.gwen/gwen.d.ts` enriches it with the project's actual services:
 *
 * ```ts
 * // .gwen/gwen.d.ts — auto-generated
 * declare global {
 *   interface GwenDefaultServices extends _GwenServices {}
 * }
 * ```
 *
 * This allows `EngineAPI` (and all `define*` helpers) to be fully typed
 * **without any explicit generic annotation** in user code:
 *
 * ```ts
 * // ✅ After gwen prepare — api is fully typed automatically
 * export const PlayerSystem = defineSystem({
 *   name: 'PlayerSystem',
 *   onUpdate(api, dt) {
 *     const kb = api.services.get('keyboard'); // → KeyboardInput ✅
 *   }
 * });
 * ```
 *
 * @see https://www.typescriptlang.org/docs/handbook/declaration-merging.html
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
declare global {
  /**
   * Global service registry — enriched by `gwen prepare` with the project's actual services.
   * The index signature satisfies `Record<string, unknown>` so it works as a generic default.
   */
  interface GwenDefaultServices {
    [key: string]: unknown;
  }
}

// ============= Service Locator =============

/**
 * Typed service locator parameterized by a service map `M`.
 *
 * When `M` is inferred from plugins declared in `defineConfig()`,
 * both `get()` and `register()` are strongly typed on the map's keys and values.
 *
 * @example
 * ```typescript
 * // With typed plugins:
 * api.services.get('keyboard')  // → KeyboardInput  ✅
 * api.services.get('audio')     // → AudioManager   ✅
 * api.services.get('unknown')   // → TS error       ❌
 *
 * // Without typed plugins (fallback):
 * api.services.get<MyService>('anything')  // → MyService (explicit cast)
 * ```
 */
export interface TypedServiceLocator<M extends GwenDefaultServices = GwenDefaultServices> {
  /**
   * Register a service by name. Keys and values are typed if M is inferred.
   * @param name Service name (key)
   * @param instance Service instance
   */
  register<K extends keyof M & string>(name: K, instance: M[K]): void;

  /**
   * Get a service by name.
   * @param name Service name
   * @returns The service instance, type-safe if M is inferred
   */
  get<K extends keyof M & string>(name: K): M[K];

  /**
   * Check if a service is registered.
   * @param name Service name
   * @returns true if registered
   */
  has(name: string): boolean;
}

export type ServiceLocator = TypedServiceLocator<Record<string, never>>;

export interface IPluginRegistrar {
  register(plugin: TsPlugin): void;
  unregister(name: string): boolean;
  get<T extends TsPlugin = TsPlugin>(name: string): T | undefined;
}

// ============= Scene Navigator =============

/**
 * Minimal contract for scene navigation from plugins.
 * Breaks circular dependency with SceneManager.
 */
export interface SceneNavigator {
  /**
   * Load a scene at the next frame (safe to call from onUpdate).
   * @param name Scene name
   */
  load(name: string): void;

  /** Name of the currently active scene, null if none. */
  readonly current: string | null;
}

// ============= EngineAPI =============

/**
 * The API surface exposed to all TsPlugins during lifecycle callbacks.
 *
 * The generic parameter `M` represents the service map available from plugins declared in `defineConfig()`.
 * It defaults to `GwenDefaultServices` — a global interface enriched by `gwen prepare` with the
 * project's actual services. This means **no explicit generic annotation is needed** after running
 * `gwen prepare`:
 *
 * @example
 * ```typescript
 * // ✅ No annotation needed — api is fully typed after gwen prepare
 * onUpdate(api, dt) {
 *   const kb = api.services.get('keyboard'); // → KeyboardInput ✅
 * }
 *
 * // ✅ Explicit annotation still works (for clarity or library authors)
 * onUpdate(api: EngineAPI<GwenDefaultServices>, dt: number) { ... }
 * ```
 */
export interface EngineAPI<M extends GwenDefaultServices = GwenDefaultServices> {
  /** Query entities by required component types */
  query(
    componentTypes: Array<
      ComponentType | import('./schema').ComponentDefinition<import('./schema').ComponentSchema>
    >,
  ): EntityId[];

  /** Create a new entity */
  createEntity(): EntityId;

  /** Destroy an entity and remove all its components */
  destroyEntity(id: EntityId): boolean;

  /** Add / update a component on an entity (string type) */
  addComponent<T>(id: EntityId, type: ComponentType, data: T): void;
  addComponent<
    D extends import('./schema').ComponentDefinition<import('./schema').ComponentSchema>,
  >(
    id: EntityId,
    type: D,
    data: import('./schema').InferComponent<D>,
  ): void;

  /** Get a component from an entity (string type) */
  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
  getComponent<
    D extends import('./schema').ComponentDefinition<import('./schema').ComponentSchema>,
  >(
    id: EntityId,
    type: D,
  ): import('./schema').InferComponent<D> | undefined;

  /** Check if an entity has a component */
  hasComponent(
    id: EntityId,
    type: ComponentType | import('./schema').ComponentDefinition<any>,
  ): boolean;

  /** Remove a component from an entity */
  removeComponent(
    id: EntityId,
    type: ComponentType | import('./schema').ComponentDefinition<any>,
  ): boolean;

  /** Service locator — typed on services from declared plugins */
  services: TypedServiceLocator<M>;

  /** Prefab manager — instantiate pre-assembled entities */
  readonly prefabs: import('./core/prefab').PrefabManager;

  /**
   * Scene navigator — available if a SceneManager is registered.
   * null if no SceneManager is active (headless tests, etc.).
   *
   * @example
   * ```ts
   * onUpdate(api) {
   *   if (lives <= 0) api.scene?.load('MainMenu');
   * }
   * ```
   */
  readonly scene: SceneNavigator | null;

  /** Current delta time in seconds */
  readonly deltaTime: number;

  /** Current frame count */
  readonly frameCount: number;

  /**
   * Get the current generation for an entity slot index.
   * Use this to reconstruct a packed EntityId from a raw slot index,
   * e.g. when Rapier/WASM physics returns entity indices.
   *
   * @example
   * ```ts
   * // Rapier returns raw slot index — reconstruct packed EntityId
   * const gen = api.getEntityGeneration(slotIndex);
   * const packedId = (gen << 20) | (slotIndex & 0xfffff);
   * const tag = api.getComponent(packedId, Tag);
   * ```
   */
  getEntityGeneration(slotIndex: number): number;
}

// ============= TsPlugin =============

/**
 * Interface for all TypeScript plugins.
 *
 * Lifecycle (called each frame in this order):
 * 1. onBeforeUpdate — capture inputs, intentions
 * 2. (WASM plugins run here — physics, AI)
 * 3. onUpdate — game logic on updated values
 * 4. onRender — drawing / display
 *
 * onInit / onDestroy called once.
 */
export interface TsPlugin {
  /** Unique name for this plugin */
  readonly name: string;

  /** Called once when plugin is registered */
  onInit?(api: EngineAPI): void;

  /** Called at start of each frame — use for input capture */
  onBeforeUpdate?(api: EngineAPI, deltaTime: number): void;

  /** Called after WASM update — use for game logic */
  onUpdate?(api: EngineAPI, deltaTime: number): void;

  /** Called after all updates — use for rendering */
  onRender?(api: EngineAPI): void;

  /** Called when plugin is removed or engine stops */
  onDestroy?(): void;
}

/**
 * A plugin entry as declared in Scene.plugins[].
 * Can be a direct TsPlugin object or a no-arg factory (() => TsPlugin).
 * SceneManager automatically resolves factories when the scene activates.
 */
export type PluginEntry = TsPlugin | (() => TsPlugin);

// ============= Engine Configuration =============

/**
 * WASM Plugin descriptor (pre-compiled Rust crate) — legacy passive descriptor.
 * @deprecated Use GwenWasmPlugin for new plugins.
 */
export interface WasmPlugin {
  id: string;
  name: string;
  version?: string;
  /** Path to .wasm file in dist/plugins/ */
  wasmPath?: string;
  config?: Record<string, unknown>;
}

// ============= Plugin Data Bus =============

/**
 * A data channel for bulk data exchange between a WASM plugin and the engine
 * each frame. Declared statically so `PluginDataBus` can pre-allocate buffers.
 */
export interface DataChannel {
  readonly name: string;
  readonly direction: 'read' | 'write' | 'readwrite';
  /** Bytes per entity slot (e.g. 20 for pos_x, pos_y, rot, scale_x, scale_y as f32). */
  readonly strideBytes: number;
  readonly bufferType: 'f32' | 'i32' | 'u8';
}

/**
 * A ring-buffer channel for binary events written by a WASM plugin and
 * consumed by the engine each frame.
 *
 * Buffer layout:
 * - Header 8 bytes: [write_head u32][read_head u32]
 * - Body: capacityEvents × 11 bytes
 * - Each event: [type u16][slotA u32][slotB u32][flags u8]
 */
export interface EventChannel {
  readonly name: string;
  readonly direction: 'write';
  readonly bufferType: 'ring';
  readonly capacityEvents: number;
}

/** Union of all supported plugin channel types. */
export type PluginChannel = DataChannel | EventChannel;

/**
 * A standard binary event read from a GWEN event channel.
 * Format is shared across all plugins that use the ring-buffer protocol.
 */
export interface GwenEvent {
  /** u16 — event type defined by the plugin (e.g. 0 = collision). */
  type: number;
  /** u32 — raw ECS slot index of the first entity. */
  slotA: number;
  /** u32 — raw ECS slot index of the second entity (0 if N/A). */
  slotB: number;
  /** u8 — plugin-defined flags (e.g. bit 0 = started). */
  flags: number;
}

/** Byte size of the header in a ring-buffer event channel. */
export const EVENT_HEADER_BYTES = 8;
/** Byte size of a single event in the ring-buffer protocol. */
export const EVENT_STRIDE = 11;

/**
 * Active interface for all GWEN WASM plugins (physics, AI, networking…).
 *
 * Each WASM plugin is a separate `.wasm` module published in its npm package.
 * It communicates with `gwen-core` via the **Plugin Data Bus** — JS-native
 * `ArrayBuffer`s allocated independently of gwen-core's linear memory.
 *
 * ## Lifecycle
 * 1. `PluginDataBus` allocates one `ArrayBuffer` per declared channel.
 * 2. `await plugin.onInit(bridge, region, api, bus)` — loads the .wasm, receives bus.
 * 3. Each frame: `plugin.onStep(delta)` — runs the Rust simulation.
 * 4. `plugin.onDestroy()` — frees WASM resources.
 *
 * ## Example
 * ```typescript
 * export class Physics2DPlugin implements GwenWasmPlugin {
 *   readonly id = 'physics2d';
 *   readonly name = 'Physics2D';
 *   readonly sharedMemoryBytes = 0; // No legacy SAB
 *   readonly channels: PluginChannel[] = [
 *     { name: 'transform', direction: 'read', strideBytes: 20, bufferType: 'f32' },
 *     { name: 'events', direction: 'write', bufferType: 'ring', capacityEvents: 256 },
 *   ];
 *   readonly provides = { physics: {} as Physics2DAPI };
 *
 *   async onInit(bridge, region, api, bus) {
 *     const transformBuf = bus?.get(this.id, 'transform')?.buffer ?? new ArrayBuffer(maxEntities * 20);
 *     const eventsBuf    = bus?.get(this.id, 'events')?.buffer    ?? new ArrayBuffer(8 + 256 * 11);
 *     const wasm = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js', ... });
 *     this.wasm = new wasm.Physics2DPlugin(gravity, new Uint8Array(transformBuf), new Uint8Array(eventsBuf), maxEntities);
 *     api.services.register('physics', this._createAPI());
 *   }
 *   onStep(delta) { this.wasm?.step(delta); }
 *   onDestroy()   { this.wasm?.free?.(); }
 * }
 * ```
 */
export interface GwenWasmPlugin<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier used for memory region allocation (e.g. `'physics2d'`). */
  readonly id: string;
  /** Human-readable name for logs and debug overlay. */
  readonly name: string;
  readonly version?: string;

  /**
   * Bytes to allocate in the shared buffer for this plugin.
   * Set to `0` when using the Plugin Data Bus (recommended for new plugins).
   * When `0`, `SharedMemoryManager` skips allocation and `region` will be `null`.
   *
   * @default 0
   */
  readonly sharedMemoryBytes: number;

  /**
   * Data and event channels declared by this plugin.
   * `PluginDataBus` allocates one `ArrayBuffer` per channel before `onInit()`.
   * Optional — plugins without channels (or using the legacy SAB) can omit this.
   */
  readonly channels?: PluginChannel[];

  /**
   * Services this plugin exposes in `api.services`.
   * The key becomes the service name, e.g. `{ physics: ... }` → `api.services.get('physics')`.
   */
  readonly provides?: P;

  /**
   * Async initialization — loads the `.wasm`, mounts shared memory, registers services.
   * Called once by `createEngine()` before `engine.start()`.
   *
   * @param bridge  Active WasmBridge (gwen-core already initialized).
   * @param region  Pre-allocated slice of the shared buffer, or `null` if `sharedMemoryBytes === 0`.
   * @param api     EngineAPI — use `api.services.register()` here only.
   * @param bus     Plugin Data Bus — use `bus.get(this.id, 'channelName')` to access pre-allocated buffers.
   */
  onInit(
    bridge: import('./engine/wasm-bridge').WasmBridge,
    region: import('./wasm/shared-memory').MemoryRegion | null,
    api: EngineAPI,
    bus?: import('./wasm/plugin-data-bus').PluginDataBus,
  ): Promise<void>;

  /**
   * Optional pre-fetch hook — called in parallel with other plugins' `_prefetch()`
   * before the sequential `onInit()` phase begins.
   *
   * Implement this to kick off the network fetch of your `.wasm` binary early,
   * storing the result internally so `onInit()` can use it immediately without
   * a second network round-trip.
   *
   * Plugins that do not implement `_prefetch()` simply fetch inside `onInit()`.
   * Both patterns are valid — `_prefetch()` is purely an optimisation.
   *
   * @example
   * ```typescript
   * private _module: Physics2DWasmModule | null = null;
   *
   * async _prefetch() {
   *   this._module = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js', ... });
   * }
   *
   * async onInit(bridge, region, api) {
   *   // _module is already loaded — no network wait here
   *   this.wasm = new this._module!.Physics2DPlugin(gravity, region.ptr, maxEntities);
   * }
   * ```
   */
  _prefetch?(): Promise<void>;

  /**
   * Called each frame at the WasmStep slot — BEFORE `TsPlugin.onUpdate`.
   * Run the Rust simulation here: `this.wasm.step(delta)`.
   */
  onStep?(deltaTime: number): void;

  /**
   * Called when `gwen-core`'s WASM linear memory grows (`memory.grow()` event).
   *
   * A `memory.grow()` replaces the underlying `ArrayBuffer` — any `TypedArray`
   * or `DataView` built on the old buffer becomes detached. Implement this hook
   * if your plugin caches a view over the shared buffer in TypeScript:
   *
   * ```typescript
   * private bufferView: Float32Array | null = null;
   *
   * onMemoryGrow(newMemory: WebAssembly.Memory) {
   *   // Recreate the view on the new, valid ArrayBuffer
   *   this.bufferView = new Float32Array(newMemory.buffer, this.region.ptr, this.slotCount * 8);
   * }
   * ```
   *
   * Rust-side code is unaffected — Rust always computes addresses from its own
   * pointer arithmetic and never holds a JS `ArrayBuffer` reference.
   */
  onMemoryGrow?(newMemory: WebAssembly.Memory): void;

  /** Called when the engine stops. Free WASM resources: `this.wasm?.free?.()`. */
  onDestroy?(): void;
}

/**
 * Engine configuration — Nuxt-like style with explicit plugin separation.
 *
 * @example
 * ```typescript
 * defineConfig({
 *   engine: { maxEntities: 10000, targetFPS: 60 },
 *   wasm: [Physics2D({ gravity: 9.81 })],
 *   ts: [Input(), Audio()],
 * })
 * ```
 */
export interface EngineConfig {
  /** Maximum number of alive entities at once */
  maxEntities: number;
  /** Target frames per second */
  targetFPS: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Enable performance stats collection */
  enableStats?: boolean;
  /** WASM plugins (Rust-compiled, heavy computation) */
  wasmPlugins?: GwenWasmPlugin[];
  /** TypeScript plugins (bundled, web APIs) */
  tsPlugins?: TsPlugin[];
}

// ============= Event System =============

export type EngineEventType =
  | 'start'
  | 'stop'
  | 'update'
  | 'entityCreated'
  | 'entityDestroyed'
  | 'componentAdded'
  | 'componentRemoved';

export interface UpdateEvent {
  deltaTime: number;
  frameCount: number;
}

export interface EngineStats {
  fps: number;
  frameCount: number;
  deltaTime: number;
  entityCount: number;
  isRunning: boolean;
}

// ============= Asset System =============

export type AssetType = 'image' | 'audio' | 'json' | 'text';

export interface Asset {
  id: string;
  type: AssetType;
  url: string;
  data?: unknown;
  loaded: boolean;
}

// ============= Query System =============

export interface QueryFilter {
  components?: ComponentType[];
  exclude?: ComponentType[];
}
