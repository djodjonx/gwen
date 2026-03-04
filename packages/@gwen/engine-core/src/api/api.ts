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

// ============= ServiceLocator =============

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

  /** List all registered service names (debug / introspection). */
  list(): string[] {
    return [...this.registry.keys()];
  }

  /** Remove a service (useful for hot-reload scenarios). */
  unregister(name: string): boolean {
    return this.registry.delete(name);
  }
}

// ============= EngineAPI Implementation =============

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

  createEntity(): EntityId {
    return this.entityManager.create();
  }

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

  query(componentTypes: ComponentType[]): EntityId[] {
    return this.queryEngine.query(componentTypes, this.entityManager, this.components);
  }

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
 * Factory — creates a fully wired EngineAPI for a given ECS context.
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
  return new EngineAPIImpl<M, H>(entityManager, components, queryEngine, locator, state, hooks!);
}
