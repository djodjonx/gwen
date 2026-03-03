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
export interface TypedServiceLocator<M extends Record<string, unknown> = Record<string, unknown>> {
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
 * It is automatically inferred by TypeScript.
 *
 * @example
 * ```typescript
 * // Without explicit typing (fallback):
 * onInit(api: EngineAPI) { ... }
 *
 * // With inferred typing via defineConfig():
 * onInit(api: EngineAPI<{ keyboard: KeyboardInput; audio: AudioManager }>) { ... }
 * ```
 */
export interface EngineAPI<M extends Record<string, unknown> = Record<string, unknown>> {
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
 * WASM Plugin descriptor (pre-compiled Rust crate)
 */
export interface WasmPlugin {
  id: string;
  name: string;
  version?: string;
  /** Path to .wasm file in dist/plugins/ */
  wasmPath?: string;
  config?: Record<string, unknown>;
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
  wasmPlugins?: WasmPlugin[];
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
