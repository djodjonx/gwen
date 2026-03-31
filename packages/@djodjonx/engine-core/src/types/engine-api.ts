/**
 * Service locator types — typed DI container used by EngineAPI.
 *
 * `TypedServiceLocator<M>` is parameterized by a service map `M`.
 * When `M` is inferred from `defineConfig()`, `get()` and `register()` are
 * fully typed without any explicit annotation in user code.
 */

import type { EntityId, ComponentType } from './entity';
import type { ComponentSchema } from '../schema';

// Re-export EntityId as part of the types module public API
export type { EntityId, ComponentType } from './entity';

// ── Service locator ───────────────────────────────────────────────────────────

/** Service key type: strict when services are known, open string fallback otherwise. */
export type ServiceKey<M extends object> = [keyof M] extends [never] ? string : keyof M & string;

/** Service value type for TypedServiceLocator. */
export type ServiceValue<M extends object, K extends ServiceKey<M>> = [keyof M] extends [never]
  ? unknown
  : K extends keyof M
    ? M[K]
    : never;

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
export interface TypedServiceLocator<M extends object = GwenDefaultServices> {
  /**
   * Register a service under the given key.
   * Overwrites any existing registration with a warning.
   *
   * @param name     Service key (must be a key of `M`).
   * @param instance Service instance.
   */
  register<K extends ServiceKey<M>>(name: K, instance: ServiceValue<M, K>): void;

  /**
   * Retrieve a service by key.
   * Throws a descriptive error if the key is not registered.
   *
   * @param name Service key.
   * @returns The registered service instance, typed as `M[K]`.
   */
  get<K extends ServiceKey<M>>(name: K): ServiceValue<M, K>;

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
   * Dynamically register a `GwenPlugin` at runtime.
   * Calls the plugin's `onInit()` immediately.
   *
   * @param plugin Plugin to register.
   */
  register(plugin: import('./plugin').GwenPlugin): void;

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
  get<T extends import('./plugin').GwenPlugin = import('./plugin').GwenPlugin>(
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

// ── Component namespace ───────────────────────────────────────────────────────

/**
 * Canonical component namespace — use this for all component operations in plugin code.
 *
 * Accessible via `api.component.*`.
 *
 * @example
 * ```ts
 * api.component.add(id, Transform, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
 * api.component.set(id, Transform, { position: { x: 1, y: 0, z: 0 } });
 * const t = api.component.get(id, Transform);
 * api.component.remove(id, Transform);
 * ```
 */
export interface ComponentAPI {
  /**
   * Attach or overwrite a component on an entity.
   * Use for initial creation in `onInit` / `onSpawn`.
   *
   * @param id  Target entity.
   * @param def Component definition.
   * @param data Component data matching the schema.
   */
  add<S extends ComponentSchema>(
    id: EntityId,
    def: import('../schema').ComponentDefinition<S>,
    data: import('../schema').InferComponent<import('../schema').ComponentDefinition<S>>,
  ): void;

  /**
   * Patch component fields on an entity (upsert — creates with defaults if absent).
   * Use for per-frame updates in `onUpdate`.
   *
   * Merges `patch` onto the existing value (or `def.defaults` when the component
   * is absent). No full-object allocation required for partial updates.
   *
   * @param id    Target entity.
   * @param def   Component definition (must have a schema).
   * @param patch Partial update — only the supplied fields are changed.
   */
  set<S extends ComponentSchema>(
    id: EntityId,
    def: import('../schema').ComponentDefinition<S>,
    patch: Partial<import('../schema').InferComponent<import('../schema').ComponentDefinition<S>>>,
  ): void;

  /**
   * Read a component from an entity.
   *
   * @param id  Target entity.
   * @param def Component definition.
   * @returns The component data, or `undefined` if not present or entity is dead.
   */
  get<S extends ComponentSchema>(
    id: EntityId,
    def: import('../schema').ComponentDefinition<S>,
  ): import('../schema').InferComponent<import('../schema').ComponentDefinition<S>> | undefined;

  /**
   * Read a component, throwing if absent.
   *
   * @param id  Target entity.
   * @param def Component definition.
   * @returns The component data.
   * @throws {Error} `[GWEN] component.getOrThrow: entity <id> does not have component '<name>'`
   */
  getOrThrow<S extends ComponentSchema>(
    id: EntityId,
    def: import('../schema').ComponentDefinition<S>,
  ): import('../schema').InferComponent<import('../schema').ComponentDefinition<S>>;

  /**
   * Remove a component from an entity.
   *
   * @param id  Target entity.
   * @param def Component definition.
   * @returns `true` if the component existed and was removed.
   */
  remove(
    id: EntityId,
    def: import('../schema').ComponentDefinition<import('../schema').ComponentSchema>,
  ): boolean;

  /**
   * Return `true` if the entity has the given component.
   *
   * @param id  Target entity.
   * @param def Component definition or string tag name.
   */
  has(
    id: EntityId,
    def: import('../schema').ComponentDefinition<import('../schema').ComponentSchema> | string,
  ): boolean;
}

// ── Entity namespace ──────────────────────────────────────────────────────────

/**
 * Canonical entity namespace — use this for all entity operations in plugin code.
 *
 * Accessible via `api.entity.*`.
 *
 * @example
 * ```ts
 * const id = api.entity.create();
 * api.entity.tag(id, 'grounded');
 * api.entity.destroy(id);
 * ```
 */
export interface EntityAPI {
  /**
   * Create a new entity and return its packed 64-bit `EntityId`.
   *
   * @returns A fresh entity id with generation 0.
   */
  create(): EntityId;

  /**
   * Destroy an entity and remove all its components.
   *
   * @param id Entity to destroy.
   * @returns `false` if the entity is already dead.
   */
  destroy(id: EntityId): boolean;

  /**
   * Return `true` if the entity is still alive (generation check).
   *
   * @param id Entity to check.
   */
  isAlive(id: EntityId): boolean;

  /**
   * Return the generation counter for a raw entity slot index.
   *
   * Used to reconstruct a valid `EntityId` from a WASM-side raw slot index
   * (e.g. `slotA` / `slotB` returned by physics collision events).
   *
   * @param slotIndex Raw entity slot index from WASM.
   * @returns The current generation counter for that slot.
   *
   * @example
   * ```ts
   * import { createEntityId } from '@djodjonx/gwen-engine-core';
   *
   * const gen = api.entity.getGeneration(slotA);
   * const entityId = createEntityId(slotA, gen);
   * ```
   */
  getGeneration(slotIndex: number): number;

  /**
   * Add a tag (marker-component) to an entity.
   * Tags are zero-data components used for filtering queries.
   *
   * @param id  Target entity.
   * @param tag Unique tag name.
   */
  tag(id: EntityId, tag: string): void;

  /**
   * Remove a tag from an entity.
   *
   * @param id  Target entity.
   * @param tag Tag name to remove.
   */
  untag(id: EntityId, tag: string): void;

  /**
   * Return `true` if the entity has the given tag.
   *
   * @param id  Target entity.
   * @param tag Tag name to check.
   */
  hasTag(id: EntityId, tag: string): boolean;
}

// ── EngineAPI ─────────────────────────────────────────────────────────────────

/**
 * The API surface exposed to every GwenPlugin during its lifecycle callbacks.
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
/**
 * The API surface exposed to every GwenPlugin during its lifecycle callbacks.
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
 *     const id = api.entity.create();
 *     api.component.add(id, Transform, { position: { x: 0, y: 0, z: 0 } });
 *   },
 * });
 * ```
 */
export interface EngineAPI<
  M extends object = GwenDefaultServices,
  H extends object = GwenDefaultHooks,
> {
  // ── ECS namespaces ────────────────────────────────────────────────────────

  /**
   * Canonical component namespace — add, set, get, remove, has.
   *
   * Use `api.component.*` in all plugin and system code.
   */
  readonly component: ComponentAPI;

  /**
   * Canonical entity namespace — create, destroy, isAlive, tag, untag, hasTag.
   *
   * Use `api.entity.*` in all plugin and system code.
   */
  readonly entity: EntityAPI;

  /**
   * Return all entity IDs that have ALL of the given component types.
   * Results are cached and invalidated on any component mutation.
   *
   * Accepts both string names and `ComponentDefinition` objects.
   */
  query(
    componentTypes: Array<
      ComponentType | import('../schema').ComponentDefinition<import('../schema').ComponentSchema>
    >,
  ): EntityId[];

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

  /**
   * Direct access to the Rust WASM engine instance.
   *
   * **Power-user only**: Allows direct calls to `wasm_bindgen` exports.
   * Used by adapter plugins (e.g. Physics2D) to avoid overhead.
   *
   * Throws if `initWasm()` has not been called.
   */
  readonly wasm: import('../engine/wasm-bridge').WasmEngine;
}
