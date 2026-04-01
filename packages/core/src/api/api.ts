/**
 * EngineAPI & ServiceLocator
 *
 * Exposes ECS operations and service injection to GwenPlugins.
 * This module can be used independently for advanced plugin scenarios.
 *
 * Architecture (ENGINE.md §5):
 *  - Pure DI (constructor): preferred for testable plugins
 *  - ServiceLocator (api.services): for runtime cross-plugin communication
 *    Rule: resolve services only in onInit(), never in onUpdate()
 */

import type { TypedServiceLocator, EngineAPI, ComponentType, SceneNavigator } from '../types';
import type { ComponentAPI, EntityAPI } from '../types/engine-api';
import type { ComponentDefinition, ComponentSchema, InferComponent } from '../schema';
import type { EntityId } from '../types/entity';
import { EntityManager, ComponentRegistry, QueryEngine } from '../core/ecs';
import {
  normalizeComponentTypesForQuery,
  type ComponentTypeInput,
} from '../core/component-type-normalizer';
import { PrefabManager } from '../core/prefab';
import { createGwenHooks } from '../hooks';
import { getWasmBridge, type WasmEngine } from '../engine/wasm-bridge';

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
  M extends object = GwenDefaultServices,
> implements TypedServiceLocator<M> {
  private registry = new Map<string, unknown>();

  register<K extends import('../types').ServiceKey<M>>(
    name: K,
    instance: import('../types').ServiceValue<M, K>,
  ): void {
    if (this.registry.has(name as string)) {
      console.warn(`[GWEN:ServiceLocator] '${name as string}' already registered — overwriting.`);
    }
    this.registry.set(name as string, instance);
  }

  get<K extends import('../types').ServiceKey<M>>(name: K): import('../types').ServiceValue<M, K> {
    if (!this.registry.has(name as string)) {
      throw new Error(
        `[GWEN:ServiceLocator] Service '${name as string}' not found. ` +
          `Available: [${[...this.registry.keys()].join(', ')}]`,
      );
    }
    return this.registry.get(name as string) as import('../types').ServiceValue<M, K>;
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
  M extends object = GwenDefaultServices,
  H extends object = GwenDefaultHooks,
> implements EngineAPI<M, H> {
  readonly services: TypedServiceLocator<M>;
  readonly prefabs: PrefabManager;

  /**
   * Canonical component namespace — delegates to internal `ComponentRegistry`.
   * @see ComponentAPI
   */
  readonly component: ComponentAPI;

  /**
   * Canonical entity namespace — delegates to internal `EntityManager`.
   * @see EntityAPI
   */
  readonly entity: EntityAPI;

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
    this.prefabs._setAPI(this as any);
    this.hooks = hooks;

    // Build the component namespace — delegates to internal ComponentRegistry
    const self = this;
    this.component = {
      add<S extends ComponentSchema>(
        id: EntityId,
        def: ComponentDefinition<S>,
        data: InferComponent<ComponentDefinition<S>>,
      ): void {
        self.components.add(id, def, data as any);
        self.queryEngine.invalidate();
      },

      set<S extends ComponentSchema>(
        id: EntityId,
        def: ComponentDefinition<S>,
        patch: Partial<InferComponent<ComponentDefinition<S>>>,
      ): void {
        const current = (self.components.get(id, def) ?? def.defaults ?? {}) as InferComponent<
          ComponentDefinition<S>
        >;
        self.components.add(id, def, { ...current, ...patch } as any);
        self.queryEngine.invalidate();
      },

      get<S extends ComponentSchema>(
        id: EntityId,
        def: ComponentDefinition<S>,
      ): InferComponent<ComponentDefinition<S>> | undefined {
        return self.components.get(id, def) as InferComponent<ComponentDefinition<S>> | undefined;
      },

      getOrThrow<S extends ComponentSchema>(
        id: EntityId,
        def: ComponentDefinition<S>,
      ): InferComponent<ComponentDefinition<S>> {
        const val = self.components.get(id, def) as
          | InferComponent<ComponentDefinition<S>>
          | undefined;
        if (val === undefined) {
          throw new Error(
            `[GWEN] component.getOrThrow: entity ${String(id)} does not have component '${def.name}'. ` +
              `Add it first with api.component.add().`,
          );
        }
        return val;
      },

      remove(id: EntityId, def: ComponentDefinition<ComponentSchema>): boolean {
        const result = self.components.remove(id, def);
        if (result) self.queryEngine.invalidate();
        return result;
      },

      has(id: EntityId, def: ComponentDefinition<ComponentSchema> | string): boolean {
        return self.components.has(id, def);
      },
    };

    // Build the entity namespace — delegates to internal EntityManager
    this.entity = {
      create(): EntityId {
        return self.entityManager.create();
      },

      destroy(id: EntityId): boolean {
        if (!self.entityManager.isAlive(id)) return false;
        self.components.removeAll(id);
        const result = self.entityManager.destroy(id);
        self.queryEngine.invalidate();
        return result;
      },

      isAlive(id: EntityId): boolean {
        return self.entityManager.isAlive(id);
      },

      getGeneration(slotIndex: number): number {
        return self.entityManager.getGeneration(slotIndex);
      },

      tag(id: EntityId, tag: string): void {
        self.components.add(id, tag, {});
        self.queryEngine.invalidate();
      },

      untag(id: EntityId, tag: string): void {
        self.components.remove(id, tag);
        self.queryEngine.invalidate();
      },

      hasTag(id: EntityId, tag: string): boolean {
        return self.components.has(id, tag);
      },
    };
  }

  get wasm(): WasmEngine {
    return getWasmBridge().engine();
  }

  get deltaTime(): number {
    return this.state.deltaTime;
  }

  get frameCount(): number {
    return this.state.frameCount;
  }

  get scene(): SceneNavigator | null {
    return this.services.has('SceneManager')
      ? (this.services.get(
          'SceneManager' as import('../types').ServiceKey<M>,
        ) as unknown as SceneNavigator)
      : null;
  }

  // ── Internal entity helpers (not on EngineAPI interface) ──────────────────

  /**
   * Create a new entity and return its packed EntityId.
   * @internal Use `api.entity.create()` in plugin code.
   */
  createEntity(): EntityId {
    return this.entityManager.create();
  }

  /**
   * Destroy an entity and remove all its components.
   * @returns `false` if the entity was already dead.
   * @internal Use `api.entity.destroy()` in plugin code.
   */
  destroyEntity(id: EntityId): boolean {
    return this.entity.destroy(id);
  }

  /**
   * Check whether an entity is alive.
   * @internal Use `api.entity.isAlive()` in plugin code.
   */
  entityExists(id: EntityId): boolean {
    return this.entityManager.isAlive(id);
  }

  // ── Internal component helpers (not on EngineAPI interface) ───────────────

  /**
   * Attach or overwrite a component on an entity.
   * @internal Use `api.component.add()` in plugin code.
   */
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

  /**
   * Read a component from an entity.
   * @internal Use `api.component.get()` in plugin code.
   */
  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
  getComponent<D extends ComponentDefinition<ComponentSchema>>(
    id: EntityId,
    type: D,
  ): InferComponent<D> | undefined;
  getComponent(id: EntityId, type: string | ComponentDefinition<ComponentSchema>): unknown {
    return this.components.get(id, type);
  }

  /**
   * Return `true` if an entity has the given component type.
   * @internal Use `api.component.has()` in plugin code.
   */
  hasComponent(id: EntityId, type: string | ComponentDefinition<ComponentSchema>): boolean {
    return this.components.has(id, type);
  }

  /**
   * Remove a component from an entity.
   * @internal Use `api.component.remove()` in plugin code.
   */
  removeComponent(id: EntityId, type: string | ComponentDefinition<ComponentSchema>): boolean {
    const result = this.components.remove(id, type);
    if (result) this.queryEngine.invalidate();
    return result;
  }

  /**
   * Return the generation counter for a raw entity slot index.
   * @internal Use `api.entity.getGeneration()` in plugin code.
   */
  getEntityGeneration(slotIndex: number): number {
    return this.entityManager.getGeneration(slotIndex);
  }

  // ── Query ──────────────────────────────────────────────────────────────

  /**
   * Return all entities that have ALL of the given component types.
   * Results are cached and invalidated on any component mutation.
   *
   * Accepts both string names and ComponentDefinition objects.
   */
  query(componentTypes: ComponentTypeInput[]): EntityId[] {
    const normalized = normalizeComponentTypesForQuery(componentTypes);
    return this.queryEngine.query(normalized, this.entityManager, this.components);
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
  M extends object = GwenDefaultServices,
  H extends object = GwenDefaultHooks,
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
