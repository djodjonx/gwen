/**
 * Service locator types — typed DI container used by EngineAPI.
 *
 * `TypedServiceLocator<M>` is parameterized by a service map `M`.
 * When `M` is inferred from `defineConfig()`, `get()` and `register()` are
 * fully typed without any explicit annotation in user code.
 */

import type { EntityId, ComponentType } from './entity';

// Re-export EntityId as part of the types module public API
export type { EntityId, ComponentType } from './entity';

// ── Service locator ───────────────────────────────────────────────────────────

/**
 * Typed service locator parameterized by a service map `M`.
 *
 * @example
 * ```ts
 * api.services.get('keyboard')  // → KeyboardInput  ✅ (after gwen prepare)
 * api.services.get('unknown')   // → TS error       ❌
 * api.services.get<MyService>('anything')  // explicit cast fallback
 * ```
 */
export interface TypedServiceLocator<M extends GwenDefaultServices = GwenDefaultServices> {
  /**
   * Register a service under the given key.
   * Overwrites any existing registration with a warning.
   *
   * @param name     Service key (must be a key of `M`).
   * @param instance Service instance.
   */
  register<K extends keyof M & string>(name: K, instance: M[K]): void;

  /**
   * Retrieve a service by key.
   * Throws a descriptive error if the key is not registered.
   *
   * @param name Service key.
   * @returns The registered service instance, typed as `M[K]`.
   */
  get<K extends keyof M & string>(name: K): M[K];

  /**
   * Check whether a service is registered under the given key.
   *
   * @param name Arbitrary service key.
   */
  has(name: string): boolean;
}

/**
 * Registrar interface injected into services so plugins can dynamically
 * register other plugins at runtime (e.g. from a factory system).
 */
export interface IPluginRegistrar {
  /**
   * Dynamically register a `TsPlugin` at runtime.
   * Calls the plugin's `onInit()` immediately.
   *
   * @param plugin Plugin to register.
   */
  register(plugin: import('./plugin-ts').TsPlugin): void;

  /**
   * Unregister a plugin by name — calls `onDestroy()`.
   * @returns `true` if the plugin was found and removed.
   */
  unregister(name: string): boolean;

  /**
   * Look up a registered plugin by name.
   * @typeParam T Expected plugin type.
   * @returns The plugin, or `undefined` if not found.
   */
  get<T extends import('./plugin-ts').TsPlugin = import('./plugin-ts').TsPlugin>(
    name: string,
  ): T | undefined;
}

// ── Scene navigator ───────────────────────────────────────────────────────────

/**
 * Minimal scene navigation contract exposed on `api.scene`.
 * Declared here (not in api/scene.ts) to break the circular dependency
 * between EngineAPI and SceneManager.
 */
export interface SceneNavigator {
  /**
   * Request a scene transition at the next frame.
   * Safe to call from `onUpdate()`.
   *
   * @param name  Target scene name
   * @param data  Optional context passed to `reloadOnReenter` evaluator
   */
  load(name: string, data?: Record<string, unknown>): void;
  /** Name of the currently active scene, or `null` if none. */
  readonly current: string | null;
}

// ── EngineAPI ─────────────────────────────────────────────────────────────────

/**
 * The API surface exposed to every TsPlugin during its lifecycle callbacks.
 *
 * **Generics (both enriched by `gwen prepare` — no annotation needed):**
 * - `M` — service map inferred from declared plugins
 * - `H` — hooks map inferred from declared plugins
 *
 * @example
 * ```ts
 * // ✅ Fully typed after `gwen prepare`, zero annotation required
 * export const PlayerSystem = defineSystem({
 *   name: 'PlayerSystem',
 *   onUpdate(api, dt) {
 *     const kb = api.services.get('keyboard'); // → KeyboardInput
 *     api.hooks.hook('physics:collision', (e) => {});
 *   },
 * });
 * ```
 */
export interface EngineAPI<
  M extends GwenDefaultServices = GwenDefaultServices,
  H extends GwenDefaultHooks = GwenDefaultHooks,
> {
  // ── ECS ──────────────────────────────────────────────────────────────────

  /** Create a new entity and return its packed `EntityId`. */
  createEntity(): EntityId;

  /**
   * Destroy an entity and remove all its components.
   * @returns `false` if the entity is already dead.
   */
  destroyEntity(id: EntityId): boolean;

  /**
   * Check whether an entity is still alive.
   * @returns `false` if the slot has been reused (generation mismatch).
   */
  entityExists?: (id: EntityId) => boolean;

  /**
   * Return all entity IDs that have ALL of the given component types.
   * Results are cached and invalidated on any component mutation.
   */
  query(
    componentTypes: Array<
      ComponentType | import('../schema').ComponentDefinition<import('../schema').ComponentSchema>
    >,
  ): EntityId[];

  /**
   * Attach or overwrite a component on an entity.
   * @param id   Target entity.
   * @param type Component type name or definition.
   * @param data Component data matching the type's schema.
   */
  addComponent<T>(id: EntityId, type: ComponentType, data: T): void;
  addComponent<
    D extends import('../schema').ComponentDefinition<import('../schema').ComponentSchema>,
  >(
    id: EntityId,
    type: D,
    data: import('../schema').InferComponent<D>,
  ): void;

  /**
   * Read a component from an entity.
   * @returns The component data, or `undefined` if absent or entity is dead.
   */
  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
  getComponent<
    D extends import('../schema').ComponentDefinition<import('../schema').ComponentSchema>,
  >(
    id: EntityId,
    type: D,
  ): import('../schema').InferComponent<D> | undefined;

  /** Return `true` if an entity has the given component type. */
  hasComponent(
    id: EntityId,
    type: ComponentType | import('../schema').ComponentDefinition<any>,
  ): boolean;

  /**
   * Remove a component from an entity.
   * @returns `true` if the component existed and was removed.
   */
  removeComponent(
    id: EntityId,
    type: ComponentType | import('../schema').ComponentDefinition<any>,
  ): boolean;

  /**
   * Get the generation counter for a raw entity slot index.
   * Used to reconstruct a packed EntityId from a WASM-side raw index
   * (e.g. `slotA` / `slotB` returned by physics collision events).
   *
   * @example
   * ```ts
   * const gen = api.getEntityGeneration(slotA);
   * const entityId = (gen << 20) | (slotA & 0xfffff);
   * ```
   */
  getEntityGeneration(slotIndex: number): number;

  // ── Services & hooks ─────────────────────────────────────────────────────

  /** Typed service locator — inject and resolve cross-plugin dependencies. */
  services: TypedServiceLocator<M>;

  /** Hooks system — subscribe to and fire engine lifecycle events. */
  readonly hooks: import('../hooks').GwenHookable<H>;

  // ── Scene & prefabs ───────────────────────────────────────────────────────

  /**
   * Scene navigator — trigger transitions and read the active scene name.
   * `null` if no `SceneManager` is registered.
   */
  readonly scene: SceneNavigator | null;

  /** Prefab registry — register templates and spawn entities by name. */
  readonly prefabs: import('../core/prefab').PrefabManager;

  // ── Frame state ───────────────────────────────────────────────────────────

  /** Delta time of the last frame in seconds (capped at 0.1 s). */
  readonly deltaTime: number;

  /** Total number of frames rendered since `engine.start()`. */
  readonly frameCount: number;
}
