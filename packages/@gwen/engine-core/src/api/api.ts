/**
 * EngineAPI & ServiceLocator
 *
 * Exposes ECS operations and service injection to TsPlugins.
 * This module can be used independently for advanced plugin scenarios.
 *
 * Architecture (ENGINE.md §5):
 *  - Pure DI (constructor): preferred for testable plugins
 *  - ServiceLocator (api.services): for runtime cross-plugin communication
 *    Rule: resolve services only in onInit(), never in onUpdate()
 */

import type { TypedServiceLocator, EngineAPI, ComponentType, SceneNavigator } from '../types';
import type { ComponentDefinition, ComponentSchema, InferComponent } from '../schema';
import { EntityManager, ComponentRegistry, QueryEngine, type EntityId } from '../core/ecs';
import { PrefabManager } from '../core/prefab';
import { createGwenHooks } from '../hooks';

// ── ServiceLocator ────────────────────────────────────────────────────────────

/**
 * Runtime service registry — concrete implementation of `TypedServiceLocator`.
 *
 * Plugins register their services in `onInit()` and other plugins resolve them
 * by name. Parameterized by `M` (service map) so `get()` and `register()` are
 * fully typed when `M` is inferred from `defineConfig()`.
 *
 * @typeParam M - Service map (defaults to `GwenDefaultServices`)
 *
 * @example
 * ```ts
 * // In a plugin's onInit:
 * api.services.register('keyboard', new KeyboardInput());
 *
 * // In any other plugin:
 * const kb = api.services.get('keyboard'); // typed as KeyboardInput ✅
 * ```
 */
export class ServiceLocator<
  M extends Record<string, unknown> = GwenDefaultServices,
> implements TypedServiceLocator<M> {
  private registry = new Map<string, unknown>();

  register<K extends keyof M & string>(name: K, instance: M[K]): void {
    if (this.registry.has(name)) {
      console.warn(`[GWEN:ServiceLocator] '${name}' already registered — overwriting.`);
    }
    this.registry.set(name, instance);
  }

  get<K extends keyof M & string>(name: K): M[K] {
    if (!this.registry.has(name)) {
      throw new Error(
        `[GWEN:ServiceLocator] Service '${name}' not found. ` +
          `Available: [${[...this.registry.keys()].join(', ')}]`,
      );
    }
    return this.registry.get(name) as M[K];
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  /** Return all registered service names — useful for debugging. */
  list(): string[] {
    return [...this.registry.keys()];
  }

  /**
   * Remove a service by name.
   * Useful for hot-reload scenarios where a service needs to be replaced.
   *
   * @returns `true` if the service existed and was removed.
   */
  unregister(name: string): boolean {
    return this.registry.delete(name);
  }
}

// ── EngineAPI implementation ──────────────────────────────────────────────────

/** Mutable frame state shared between the Engine and EngineAPIImpl. */
export interface EngineState {
  deltaTime: number;
  frameCount: number;
}

/**
 * Concrete implementation of EngineAPI.
 * Wraps the internal ECS and exposes a clean surface to plugins.
 *
 * Provides:
 * - Entity creation/destruction/querying
 * - Component management
 * - Service locator for cross-plugin communication
 * - Hooks system for extending engine behavior
 * - Scene management
 * - Prefab support
 *
 * @typeParam M - Service map type (inferred from declared plugins)
 * @typeParam H - Hooks map type (inferred from declared plugins)
 */
export class EngineAPIImpl<
  M extends Record<string, unknown> = GwenDefaultServices,
  H extends Record<string, any> = GwenDefaultHooks,
> implements EngineAPI<M, H> {
  readonly services: TypedServiceLocator<M>;
  readonly prefabs: PrefabManager;

  /**
   * Hooks system for engine lifecycle, plugins, entities, components, and scenes.
   *
   * Use this to:
   * - Register handlers for engine events
   * - Create custom hooks for plugin extensibility
   * - Coordinate between plugins
   *
   * Typed with `H` from declared plugins via `gwen prepare`.
   *
   * @example
   * ```typescript
   * // Register a handler
   * api.hooks.hook('entity:create', (id) => {
   *   console.log('Entity created:', id);
   * });
   *
   * // Call custom hooks (plugin-provided)
   * await api.hooks.callHook('my:event' as any, data);
   * ```
   *
   * @see {@link GwenHooks} for all available hooks
   * @see docs/api/hooks.md for complete documentation
   */
  readonly hooks: import('hookable').Hookable<H>;

  /**
   * Initialize the Engine API.
   *
   * @param entityManager - ECS entity manager instance
   * @param components - ECS component registry instance
   * @param queryEngine - ECS query engine instance
   * @param services - Service locator instance
   * @param state - Engine state (deltaTime, frameCount)
   * @param hooks - Hooks system instance
   *
   * @internal Called by createEngineAPI factory
   */
  constructor(
    private entityManager: EntityManager,
    private components: ComponentRegistry,
    private queryEngine: QueryEngine,
    services: TypedServiceLocator<M>,
    private state: EngineState,
    hooks: import('hookable').Hookable<H>,
  ) {
    this.services = services;
    this.prefabs = new PrefabManager();
    this.prefabs._setAPI(this);
    this.hooks = hooks;
  }

  get deltaTime(): number {
    return this.state.deltaTime;
  }

  get frameCount(): number {
    return this.state.frameCount;
  }

  get scene(): SceneNavigator | null {
    return this.services.has('SceneManager')
      ? (this.services.get('SceneManager') as unknown as SceneNavigator)
      : null;
  }

  // ── Entity operations ──────────────────────────────────────────────────

  /** Create a new entity and return its packed EntityId. */
  createEntity(): EntityId {
    return this.entityManager.create();
  }

  /**
   * Destroy an entity and remove all its components.
   * @returns `false` if the entity was already dead.
   */
  destroyEntity(id: EntityId): boolean {
    if (!this.entityManager.isAlive(id)) return false;
    this.components.removeAll(id);
    const result = this.entityManager.destroy(id);
    this.queryEngine.invalidate();
    return result;
  }

  // ── Component operations ───────────────────────────────────────────────

  addComponent<T>(id: EntityId, type: ComponentType, data: T): void;
  addComponent<D extends ComponentDefinition<ComponentSchema>>(
    id: EntityId,
    type: D,
    data: InferComponent<D>,
  ): void;
  addComponent(
    id: EntityId,
    type: string | ComponentDefinition<ComponentSchema>,
    data: unknown,
  ): void {
    this.components.add(id, type, data);
    this.queryEngine.invalidate();
  }

  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
  getComponent<D extends ComponentDefinition<ComponentSchema>>(
    id: EntityId,
    type: D,
  ): InferComponent<D> | undefined;
  getComponent(id: EntityId, type: string | ComponentDefinition<ComponentSchema>): unknown {
    return this.components.get(id, type);
  }

  hasComponent(id: EntityId, type: string | ComponentDefinition<ComponentSchema>): boolean {
    return this.components.has(id, type);
  }

  removeComponent(id: EntityId, type: string | ComponentDefinition<ComponentSchema>): boolean {
    const result = this.components.remove(id, type);
    if (result) this.queryEngine.invalidate();
    return result;
  }

  // ── Query ──────────────────────────────────────────────────────────────

  /**
   * Return all entities that have ALL of the given component types.
   * Results are cached and invalidated on any component mutation.
   */
  query(componentTypes: ComponentType[]): EntityId[] {
    return this.queryEngine.query(componentTypes, this.entityManager, this.components);
  }

  /**
   * Return the generation counter for a raw entity slot index.
   * Use this to reconstruct a packed EntityId from a WASM-side raw slot index
   * (e.g. `slotA` / `slotB` from physics collision events).
   */
  getEntityGeneration(slotIndex: number): number {
    return this.entityManager.getGeneration(slotIndex);
  }

  // ── State update (called by Engine each frame) ─────────────────────────

  /** @internal */
  _updateState(deltaTime: number, frameCount: number): void {
    this.state.deltaTime = deltaTime;
    this.state.frameCount = frameCount;
  }
}

/**
 * Factory — creates a fully wired EngineAPIImpl for a given ECS context.
 *
 * When `services` is omitted, a fresh `ServiceLocator` is created.
 * When `hooks` is omitted, a fresh `GwenHookable` instance is created —
 * so `api.hooks` is always defined and safe to call.
 *
 * @param entityManager - ECS entity manager
 * @param components    - ECS component registry
 * @param queryEngine   - ECS query engine
 * @param services      - Optional pre-wired service locator (defaults to empty)
 * @param hooks         - Optional hooks instance (defaults to a new GwenHookable)
 *
 * @typeParam M - Service map type
 * @typeParam H - Hooks map type
 */
export function createEngineAPI<
  M extends Record<string, unknown> = Record<string, unknown>,
  H extends Record<string, any> = GwenDefaultHooks,
>(
  entityManager: EntityManager,
  components: ComponentRegistry,
  queryEngine: QueryEngine,
  services?: TypedServiceLocator<M>,
  hooks?: import('hookable').Hookable<H>,
): EngineAPIImpl<M, H> {
  const locator = services ?? new ServiceLocator<M>();
  const state: EngineState = { deltaTime: 0, frameCount: 0 };
  const resolvedHooks = hooks ?? createGwenHooks<H>();
  return new EngineAPIImpl<M, H>(
    entityManager,
    components,
    queryEngine,
    locator,
    state,
    resolvedHooks,
  );
}
