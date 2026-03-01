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

export interface ServiceLocator {
  /** Register a singleton service by name */
  register<T>(name: string, instance: T): void;
  /** Retrieve a service — throws if not registered */
  get<T>(name: string): T;
  /** Check if a service is registered */
  has(name: string): boolean;
}

// ============= EngineAPI =============

/**
 * The API surface exposed to all TsPlugins during lifecycle callbacks.
 * Provides access to ECS, services, and engine state.
 */
export interface EngineAPI {
  /** Query entities by required component types */
  query(componentTypes: ComponentType[]): EntityId[];

  /** Create a new entity */
  createEntity(): EntityId;

  /** Destroy an entity and remove all its components */
  destroyEntity(id: EntityId): boolean;

  /** Add / update a component on an entity (string type) */
  addComponent<T>(id: EntityId, type: ComponentType, data: T): void;
  /** Add / update a component using a ComponentDefinition DSL */
  addComponent<D extends import('./schema').ComponentDefinition<any>>(
    id: EntityId,
    type: D,
    data: import('./schema').InferComponent<D>
  ): void;

  /** Get a component from an entity (string type) */
  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
  /** Get a component using a ComponentDefinition DSL */
  getComponent<D extends import('./schema').ComponentDefinition<any>>(
    id: EntityId,
    type: D
  ): import('./schema').InferComponent<D> | undefined;

  /** Check if an entity has a component */
  hasComponent(id: EntityId, type: ComponentType | import('./schema').ComponentDefinition<any>): boolean;

  /** Remove a component from an entity */
  removeComponent(id: EntityId, type: ComponentType | import('./schema').ComponentDefinition<any>): boolean;


  /** Service locator — inject dependencies between plugins */
  services: ServiceLocator;

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
