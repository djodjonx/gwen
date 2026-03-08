/**
 * GWEN Engine — game loop orchestrator.
 *
 * Responsibilities (only these):
 *  - Initialize subsystems (WASM bridge, API, plugins)
 *  - Drive the RAF game loop (_start / _stop / _tick)
 *  - Expose the public facade for plugins, entities and components
 *
 * Heavy internals live in dedicated modules:
 *  - Binary serialization   → engine-serializer.ts
 *  - Component type mapping → engine-component-registry.ts
 *  - Singleton helpers      → engine-globals.ts
 *  - WASM shims             → engine-api.ts
 *
 * @example
 * ```typescript
 * await initWasm();
 * const engine = new Engine({ maxEntities: 5000, targetFPS: 60 });
 * engine.registerSystem(new Canvas2DRenderer({ canvas: 'game' }));
 * engine.start();
 * ```
 */

import type { EngineConfig, GwenPlugin, ComponentType } from '../types';
import { ServiceLocator, EngineAPIImpl, createEngineAPI } from '../api/api';
import { PluginManager } from '../plugin-system/plugin-manager';
import { defaultConfig, mergeConfigs } from '../config/config';
import { getWasmBridge, type WasmBridge } from './wasm-bridge';
import type { SharedMemoryManager } from '../wasm/shared-memory';
import type { PluginDataBus } from '../wasm/plugin-data-bus';
import { type ComponentDefinition, type ComponentSchema } from '../schema';
import type { EntityManager, ComponentRegistry, QueryEngine } from '../core/ecs';
import {
  createEntityId,
  unpackEntityId,
  type EntityId,
  type ComponentFieldValue,
  createShims,
} from './engine-api';
import { createGwenHooks, type GwenHookable } from '../hooks';
import { EngineSerializer } from './engine-serializer';
import { EngineComponentRegistry } from './engine-component-registry';

export class Engine {
  private config: EngineConfig;

  // ── Game loop state ─────────────────────────────────────────────────────────
  private isRunning = false;
  private _frameCount = 0;
  private lastFrameTime = 0;
  private _deltaTime = 0;
  private fps = 0;
  private rafHandle = 0;

  // ── Subsystems ──────────────────────────────────────────────────────────────
  private pluginManager: PluginManager;
  private api: EngineAPIImpl<GwenDefaultServices, GwenDefaultHooks>;
  private wasmBridge: WasmBridge;
  private serializer: EngineSerializer;
  private componentRegistry: EngineComponentRegistry;

  /** Unified event and lifecycle management — available to all plugins via `api.hooks`. */
  public readonly hooks: GwenHookable<GwenDefaultHooks> = createGwenHooks<GwenDefaultHooks>();

  // ── WASM shared memory (set by createEngine after plugin init) ───────────────
  private sharedMemoryPtr = 0;
  private sharedMemoryMaxEntities = 0;
  private sharedMemoryManager: SharedMemoryManager | null = null;
  private pluginDataBus: PluginDataBus | null = null;

  // ── Legacy plugin map (backward compat) ─────────────────────────────────────
  private legacyPlugins = new Map<string, unknown>();

  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Create and initialize the engine.
   *
   * Merges `userConfig` with the defaults, wires up the WASM bridge,
   * creates the ECS shims, registers the internal `PluginRegistrar` service
   * and fires the `engine:init` hook.
   *
   * Does NOT start the game loop — call `await engine.start()` for that.
   *
   * @param userConfig Partial engine configuration (merged with defaults).
   */
  constructor(userConfig?: Partial<EngineConfig>) {
    this.config = mergeConfigs(defaultConfig, userConfig ?? {});
    this._validateConfig();

    this.wasmBridge = getWasmBridge();
    this.serializer = new EngineSerializer();
    this.componentRegistry = new EngineComponentRegistry(this.wasmBridge);

    const { entityShim, componentShim, queryShim } = createShims(this);

    this.api = createEngineAPI(
      entityShim as unknown as EntityManager,
      componentShim as unknown as ComponentRegistry,
      queryShim as unknown as QueryEngine,
      new ServiceLocator(),
      this.hooks,
    ) as EngineAPIImpl;

    this.pluginManager = new PluginManager();

    // PluginRegistrar injected into services for late dynamic registration
    this.api.services.register('PluginRegistrar', {
      register: (plugin: GwenPlugin) => this.pluginManager.register(plugin, this.api, this.hooks),
      unregister: (name: string) => this.pluginManager.unregister(name, this.hooks),
      get: (name: string) => this.pluginManager.get(name),
    } as import('../types').IPluginRegistrar);

    if (this.config.debug) {
      console.log('[GWEN] Engine initialized', this.config);
      if (this.wasmBridge.isActive()) {
        console.log('[GWEN] WASM core ready');
      } else {
        console.warn('[GWEN] WASM core not yet initialized — call initWasm() before start()');
      }
    }

    try {
      this.hooks.callHook('engine:init');
    } catch (err) {
      console.error('[GWEN] Error in engine:init hook:', err);
    }
  }

  // ── Config validation ────────────────────────────────────────────────────────

  /**
   * Validate config values early so errors surface at construction time.
   * @internal
   */
  private _validateConfig(): void {
    if (this.config.maxEntities < 100) {
      throw new Error('[GWEN] maxEntities must be at least 100');
    }
    if (this.config.targetFPS < 1 || this.config.targetFPS > 300) {
      throw new Error('[GWEN] targetFPS must be between 1 and 300');
    }
  }

  // ── Component serialization bridge (used by engine-api shims) ────────────────

  /**
   * Add a component to an entity and sync the binary payload to WASM.
   * @internal
   */
  public _addComponentInternal(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
    data: unknown,
  ): void {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentRegistry.getOrRegister(typeName);
    const def: ComponentDefinition<ComponentSchema> =
      typeof type === 'string' ? { name: type, schema: {} } : type;
    this.serializer.getOrComputeLayout(def);
    const bytes = this.serializer.serialize(typeName, data);
    const { index, generation } = unpackEntityId(id);

    // Only update TS cache + archetype if WASM accepted the write.
    const ok = this.wasmBridge.addComponent(index, generation, typeId, bytes);
    if (!ok) return;

    this.componentRegistry.trackAdd(index, typeId);
    this.wasmBridge.updateEntityArchetype(index, this.componentRegistry.getEntityTypeIds(id));
  }

  // ── Accessors for engine-api shims ──────────────────────────────────────────

  /** @internal */ public _getOrRegisterTypeId(type: ComponentType): number {
    return this.componentRegistry.getOrRegister(type);
  }
  /** @internal */ public _getComponentTypeId(type: ComponentType): number | undefined {
    return this.componentRegistry.get(type);
  }
  /** @internal */ public _getComponentTypeIds(): ReadonlyMap<ComponentType, number> {
    return this.componentRegistry.getAll();
  }
  /** @internal */ public _getEntityTypeIds(id: EntityId): number[] {
    return this.componentRegistry.getEntityTypeIds(id);
  }
  /** @internal */ public _serializeComponent(componentId: string, data: unknown): Uint8Array {
    return this.serializer.serialize(componentId, data);
  }
  /** @internal */ public _deserializeComponent(
    componentId: string,
    raw: Uint8Array,
  ): Record<string, ComponentFieldValue> {
    return this.serializer.deserialize(componentId, raw);
  }
  /** @internal */ public _getOrComputeLayout(def: ComponentDefinition<ComponentSchema>) {
    return this.serializer.getOrComputeLayout(def);
  }

  /**
   * Remove a component directly in WASM and keep archetype/cache state consistent.
   *
   * This method is the single source of truth for component removal and is used
   * by both Engine public API and EngineAPI shims.
   *
   * @internal
   */
  public _removeComponentInternal(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentRegistry.get(typeName);
    if (typeId === undefined) return false;

    const { index, generation } = unpackEntityId(id);
    const result = this.wasmBridge.removeComponent(index, generation, typeId);
    if (!result) return false;

    this.componentRegistry.trackRemove(index, typeId);
    this.wasmBridge.updateEntityArchetype(index, this.componentRegistry.getEntityTypeIds(id));
    return true;
  }

  /**
   * Remove all registered component types from an entity slot in WASM.
   *
   * Intended for entity destruction path; does not emit hooks.
   *
   * @internal
   */
  public _removeAllComponentsInternal(id: EntityId): void {
    const { index, generation } = unpackEntityId(id);
    for (const [, typeId] of this.componentRegistry.getAll()) {
      if (this.wasmBridge.removeComponent(index, generation, typeId)) {
        this.componentRegistry.trackRemove(index, typeId);
      }
    }
  }

  /**
   * Destroy an entity directly in WASM and clear all related query/cache state.
   *
   * This method is the single source of truth for destruction and is used
   * by both Engine public API and EngineAPI shims.
   *
   * @internal
   */
  public _destroyEntityInternal(id: EntityId): boolean {
    const { index, generation } = unpackEntityId(id);
    if (!this.wasmBridge.isAlive(index, generation)) return false;

    this._removeAllComponentsInternal(id);

    const result = this.wasmBridge.deleteEntity(index, generation);
    if (!result) return false;

    this.wasmBridge.removeEntityFromQuery(index);
    this.componentRegistry.clearEntityCache(index);
    return true;
  }

  // ── Plugin system ─────────────────────────────────────────────────────────────

  /**
   * Register a `TsPlugin` (or `System`) to participate in the game loop.
   * Plugins are initialized immediately (`onInit` is called synchronously)
   * and will receive `onBeforeUpdate`, `onUpdate` and `onRender` every frame.
   *
   * @returns `this` for chaining.
   */
  public registerSystem(plugin: GwenPlugin): this {
    this.pluginManager.register(plugin, this.api, this.hooks);
    if (this.config.debug) console.log(`[GWEN] Plugin '${plugin.name}' registered`);
    return this;
  }

  /**
   * Return a registered plugin by name.
   * @typeParam T Plugin type to cast to (defaults to `TsPlugin`).
   * @returns The plugin, or `undefined` if not found.
   */
  public getSystem<T extends GwenPlugin>(name: string): T | undefined {
    return this.pluginManager.get<T>(name);
  }

  /** Return `true` if a plugin with the given name is registered. */
  public hasSystem(name: string): boolean {
    return this.pluginManager.has(name);
  }

  /**
   * Unregister a plugin by name — calls its `onDestroy` and removes it from the loop.
   * @returns `true` if the plugin was found and removed.
   */
  public removeSystem(name: string): boolean {
    return this.pluginManager.unregister(name, this.hooks);
  }

  // ── Legacy plugin API (backward compatibility) ────────────────────────────────

  /** @deprecated Use registerSystem() instead */
  public loadPlugin(name: string, plugin: unknown): void {
    if (this.legacyPlugins.has(name)) return;
    try {
      const legacy = plugin as { init?: (engine: Engine) => void };
      if (typeof legacy.init === 'function') legacy.init(this);
      this.legacyPlugins.set(name, plugin);
    } catch (error) {
      console.error(`[GWEN] Failed to load plugin '${name}':`, error);
    }
  }

  /** @deprecated Use getSystem() instead */
  public getPlugin(name: string): unknown {
    return this.legacyPlugins.get(name);
  }

  /** @deprecated */
  public hasPlugin(name: string): boolean {
    return this.legacyPlugins.has(name);
  }

  // ── Entity management ─────────────────────────────────────────────────────────

  /**
   * Create a new entity and fire the `entity:create` hook.
   * @returns A 64-bit `EntityId` handle (branded bigint).
   */
  public async createEntity(): Promise<EntityId> {
    const { index, generation } = this.wasmBridge.createEntity();
    const id = createEntityId(index, generation);
    try {
      await this.hooks.callHook('entity:create', id);
    } catch (err) {
      console.error('[GWEN] Error in entity:create hook:', err);
    }
    return id;
  }

  /**
   * Destroy an entity — removes all its components, deletes the slot and fires hooks.
   * @returns `false` if the entity is already dead.
   */
  public destroyEntity(id: EntityId): boolean {
    if (!this.entityExists(id)) return false;

    this.hooks.callHook('entity:destroy', id);

    const result = this._destroyEntityInternal(id);

    try {
      this.hooks.callHook('entity:destroyed', id);
    } catch (err) {
      console.error('[GWEN] Error in entity:destroyed hook:', err);
    }
    return result;
  }

  /**
   * Check whether an entity is still alive.
   * @returns `false` if the slot has been reused (generation mismatch).
   */
  public entityExists(id: EntityId): boolean {
    const { index, generation } = unpackEntityId(id);
    return this.wasmBridge.isAlive(index, generation);
  }

  /** Return the number of currently alive entities. */
  public getEntityCount(): number {
    return this.wasmBridge.countEntities();
  }

  // ── Component management ──────────────────────────────────────────────────────

  /**
   * Attach or overwrite a component on an entity and fire the `component:add` hook.
   *
   * @param id   Target entity.
   * @param type Component definition or string type name.
   * @param data Component data matching the type's schema.
   */
  public addComponent<S extends ComponentSchema>(
    id: EntityId,
    type: ComponentDefinition<S> | ComponentType,
    data: S extends ComponentSchema ? { [K in keyof S]: unknown } : unknown,
  ): void {
    this._addComponentInternal(id, type, data);
    const typeName = typeof type === 'string' ? type : type.name;
    try {
      this.hooks.callHook('component:add', id, typeName, data);
    } catch (err) {
      console.error('[GWEN] Error in component:add hook:', err);
    }
  }

  /**
   * Remove a component from an entity and fire `component:remove` / `component:removed` hooks.
   * @returns `true` if the component existed and was removed.
   */
  public removeComponent(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    this.hooks.callHook('component:remove', id, typeName);

    const result = this._removeComponentInternal(id, type);
    if (result) {
      try {
        this.hooks.callHook('component:removed', id, typeName);
      } catch (err) {
        console.error('[GWEN] Error in component:removed hook:', err);
      }
    }
    return result;
  }

  /**
   * Read and deserialize a component from WASM.
   * @returns The deserialized component data, or `undefined` if absent or entity is dead.
   */
  public getComponent<T extends Record<string, ComponentFieldValue>>(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): T | undefined {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentRegistry.get(typeName);
    if (typeId === undefined) return undefined;
    const { index, generation } = unpackEntityId(id);
    const raw = this.wasmBridge.getComponentRaw(index, generation, typeId);
    if (raw.length === 0) return undefined;
    return this.serializer.deserialize(typeName, raw) as T;
  }

  /** Return `true` if an entity has the given component type attached. */
  public hasComponent(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentRegistry.get(typeName);
    if (typeId === undefined) return false;
    const { index, generation } = unpackEntityId(id);
    return this.wasmBridge.hasComponent(index, generation, typeId);
  }

  // ── Query system ──────────────────────────────────────────────────────────────

  /**
   * Return all entity IDs that have ALL of the given component types.
   * Delegates to the WASM bridge — results reflect the current simulation state.
   */
  public query(componentTypes: ComponentType[]): EntityId[] {
    const typeIds = componentTypes.map((t) => this.componentRegistry.getOrRegister(t));
    return this.wasmBridge.queryEntities(typeIds);
  }

  /**
   * Like `query()` but applies an additional filter predicate on the TypeScript side.
   * Useful for cheap secondary checks that don't justify a new archetype dimension.
   *
   * @param componentTypes Required component types.
   * @param filter         Optional predicate — return `false` to exclude an entity.
   */
  public queryWith(
    componentTypes: ComponentType[],
    filter?: (id: EntityId) => boolean,
  ): EntityId[] {
    let results = this.query(componentTypes);
    if (filter) results = results.filter(filter);
    return results;
  }

  // ── Legacy event bridge (deprecated) ─────────────────────────────────────────

  /** @deprecated Use engine.hooks.hook() instead */
  public on(eventType: string, listener: (data?: unknown) => void): void {
    if (this.config.debug) {
      console.warn(
        `[GWEN] engine.on('${eventType}') is deprecated. Use engine.hooks.hook() instead.`,
      );
    }
    (this.hooks.hook as (name: string, handler: (data?: unknown) => void) => void)(
      eventType,
      listener,
    );
  }

  /** @deprecated Use engine.hooks.removeHook() instead */
  public off(eventType: string, listener: (data?: unknown) => void): void {
    if (this.config.debug) {
      console.warn(
        `[GWEN] engine.off('${eventType}') is deprecated. Use engine.hooks.removeHook() instead.`,
      );
    }
    (this.hooks.removeHook as (name: string, handler: (data?: unknown) => void) => void)(
      eventType,
      listener,
    );
  }

  /** @deprecated Hooks are called automatically — this is a no-op */
  public emit(eventType: string, _data?: unknown): void {
    if (this.config.debug) {
      console.warn(`[GWEN] engine.emit('${eventType}') is deprecated and has no effect.`);
    }
  }

  // ── Stats & debug ─────────────────────────────────────────────────────────────

  /** Return the measured FPS from the last sampling interval (updated every 60 frames). */
  public getFPS(): number {
    return this.fps;
  }

  /** Return the delta time of the last frame in seconds (capped at 0.1 s). */
  public getDeltaTime(): number {
    return this._deltaTime;
  }

  /** Return the total number of frames rendered since `start()`. */
  public getFrameCount(): number {
    return this._frameCount;
  }

  /** Return a shallow copy of the active engine configuration. */
  public getConfig(): EngineConfig {
    return { ...this.config };
  }

  /**
   * Return a snapshot of engine runtime metrics.
   * Safe to call every frame — all reads are O(1).
   */
  public getStats() {
    return {
      fps: this.fps,
      frameCount: this._frameCount,
      deltaTime: this._deltaTime,
      entityCount: this.wasmBridge.isActive() ? this.wasmBridge.countEntities() : 0,
      isRunning: this.isRunning,
      wasmActive: this.wasmBridge.isActive(),
      wasmStats: this.wasmBridge.isActive() ? this.wasmBridge.stats() : null,
    };
  }

  /** Direct access to the `WasmBridge` singleton. */
  public getWasmBridge(): WasmBridge {
    return this.wasmBridge;
  }

  /** Direct access to the `EngineAPIImpl` instance used by plugins. */
  public getAPI(): EngineAPIImpl {
    return this.api;
  }

  // ── Internal accessors (used by bootstrap / shims) ────────────────────────────

  /** @internal */ public _getPluginManager(): PluginManager {
    return this.pluginManager;
  }
  /** @internal */ public _getWasmBridge(): WasmBridge {
    return this.wasmBridge;
  }

  /** @internal Called by createEngine() after SharedMemoryManager.create(). */
  public _setSharedMemoryPtr(ptr: number, maxEntities: number, manager: SharedMemoryManager): void {
    this.sharedMemoryPtr = ptr;
    this.sharedMemoryMaxEntities = maxEntities;
    this.sharedMemoryManager = manager;
  }

  /** @internal Called by createEngine() after plugin.wasm.onInit() resolves. */
  public _registerWasmPlugin(plugin: GwenPlugin): void {
    this.pluginManager.registerWasmPlugin(plugin);
  }

  /** @internal Called by createEngine() after channel allocation. */
  public _setPluginDataBus(bus: PluginDataBus): void {
    this.pluginDataBus = bus;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /**
   * Start the game loop.
   * Throws if `initWasm()` has not been called first.
   */
  public start(): Promise<void> {
    return this._start();
  }

  /**
   * Stop the game loop and destroy all registered plugins.
   */
  public stop(): Promise<void> {
    return this._stop();
  }

  /**
   * Manually advance one frame — useful in tests and SSR scenarios.
   * @param now High-resolution timestamp (e.g. from `performance.now()`).
   */
  public tick(now: number): Promise<void> {
    return this._tick(now);
  }

  public async _start(): Promise<void> {
    if (this.isRunning) return;
    if (!this.wasmBridge.isActive()) {
      throw new Error(
        '[GWEN] Cannot start: WASM core not initialized.\n' +
          'Call `await initWasm()` before engine.start().',
      );
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();

    try {
      await this.hooks.callHook('engine:start');
    } catch (err) {
      console.error('[GWEN] Error in engine:start hook:', err);
    }

    const loop = async (now: number) => {
      await this._tick(now);
      if (this.isRunning) this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  public async _stop(): Promise<void> {
    if (this.isRunning) cancelAnimationFrame(this.rafHandle);
    this.isRunning = false;
    this.pluginManager.destroyAll(this.hooks);
    this.pluginManager.destroyWasmPlugins();

    try {
      await this.hooks.callHook('engine:stop');
    } catch (err) {
      console.error('[GWEN] Error in engine:stop hook:', err);
    }
  }

  public async _tick(now: number): Promise<void> {
    this._deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    this._frameCount++;

    if (this._frameCount % 60 === 0) {
      this.fps = this._deltaTime > 0 ? Math.round(1 / this._deltaTime) : 0;
    }

    this.api._updateState(this._deltaTime, this._frameCount);

    try {
      await this.hooks.callHook('engine:tick', this._deltaTime);
    } catch (err) {
      console.error('[GWEN] Error in engine:tick hook:', err);
    }

    // 1 — Input capture
    await this.pluginManager.dispatchBeforeUpdate(this.api, this._deltaTime, this.hooks);

    // 2 — Sync ECS transforms → shared buffer (WASM plugins read from here)
    if (this.sharedMemoryPtr !== 0) {
      this.wasmBridge.syncTransformsToBuffer(this.sharedMemoryPtr, this.sharedMemoryMaxEntities);
    }

    // 2b — Reset ring-buffers so WASM plugins write fresh events this frame
    this.pluginDataBus?.resetEventChannels();

    // 3 — WASM step (physics, AI…)
    this.pluginManager.dispatchWasmStep(this._deltaTime);

    // 4 — Sentinel integrity check (debug only)
    if (this.config.debug && this.sharedMemoryManager !== null) {
      this.sharedMemoryManager.checkSentinels(this.wasmBridge);
    }
    if (this.config.debug && this.pluginDataBus !== null) {
      this.pluginDataBus.checkSentinels();
    }

    // 5 — Sync shared buffer → ECS transforms (WASM wrote new positions)
    if (this.sharedMemoryPtr !== 0) {
      this.wasmBridge.syncTransformsFromBuffer(this.sharedMemoryPtr, this.sharedMemoryMaxEntities);
    }

    // 6 — Tick Rust game loop
    this.wasmBridge.tick(this._deltaTime * 1000);

    // 7 — Game logic (TS)
    await this.pluginManager.dispatchUpdate(this.api, this._deltaTime, this.hooks);

    // 8 — Rendering (TS)
    await this.pluginManager.dispatchRender(this.api, this.hooks);
  }
}
