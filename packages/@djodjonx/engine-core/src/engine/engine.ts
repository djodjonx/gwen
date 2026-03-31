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
import {
  normalizeComponentTypesForQuery,
  type ComponentTypeInput,
} from '../core/component-type-normalizer';
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
  /** @internal Prevents re-entrant advance() calls in external loop mode. */
  private _advancing = false;

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
      throw err;
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

    // If string name, only compute default empty layout if no layout exists yet.
    // This allows manual registration of schemas for components used via strings (e.g. 'position').
    if (typeof type === 'string') {
      const existingLayouts = this.serializer.getLayouts();
      if (!existingLayouts.has(typeName)) {
        this.serializer.getOrComputeLayout({ name: typeName, schema: {} });
      }
    } else {
      this.serializer.getOrComputeLayout(type);
    }

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
   * Register a `GwenPlugin` (or `System`) to participate in the game loop.
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
   * @typeParam T Plugin type to cast to (defaults to `GwenPlugin`).
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

  /**
   * Unregister a plugin by name — symmetrical counterpart to `registerSystem()`.
   * Calls the plugin's `onDestroy` and removes it from the loop.
   * @returns `true` if the plugin was found and removed.
   */
  public unregisterSystem(name: string): boolean {
    return this.pluginManager.unregister(name, this.hooks);
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
   *
   * Accepts both string names and ComponentDefinition objects.
   */
  public query(componentTypes: ComponentTypeInput[]): EntityId[] {
    const normalizedTypes = normalizeComponentTypesForQuery(componentTypes);
    const typeIds = normalizedTypes.map((t) => this.componentRegistry.getOrRegister(t));
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
    componentTypes: ComponentTypeInput[],
    filter?: (id: EntityId) => boolean,
  ): EntityId[] {
    let results = this.query(componentTypes);
    if (filter) results = results.filter(filter);
    return results;
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
   * Start the engine.
   *
   * - In `loop: 'internal'` mode: fires `engine:start`, then starts the RAF loop.
   * - In `loop: 'external'` mode: fires `engine:start` only — no RAF is started.
   *   The caller is responsible for calling `engine.advance(delta)` each frame.
   *
   * @throws {Error} If `initWasm()` has not been called first.
   * @throws {Error} If any `engine:start` hook handler throws — the promise rejects
   *   with the original error so the caller can handle plugin init failures.
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
   * Advance the simulation by `delta` seconds — **external loop mode only**.
   *
   * Call this from your renderer's frame callback (e.g. R3F's `useFrame`).
   * The delta is capped at `maxDeltaSeconds` (default `0.1`) to prevent
   * simulation instability after tab suspension or debugger pauses.
   *
   * @param delta Frame delta in seconds (e.g. `1/60` for 60 FPS).
   * @throws {Error} If called when `loop` is not `'external'`.
   * @throws {Error} If called re-entrantly within the same frame.
   */
  public advance(delta: number): Promise<void> {
    if (this.config.loop !== 'external') {
      throw new Error(
        '[GWEN] engine.advance() requires loop: "external". ' +
          'Set loop: "external" in your engine config to use an external loop.',
      );
    }
    if (this._advancing) {
      throw new Error('[GWEN] engine.advance() called re-entrantly — only one advance per frame.');
    }
    this._advancing = true;
    const maxDt = this.config.maxDeltaSeconds ?? 0.1;
    const cappedDt = Math.min(delta, maxDt);
    // Synthesise an absolute timestamp from the last known frame time + capped delta.
    // This keeps _tick's internal delta calculation consistent (it recomputes dt from
    // lastFrameTime, so we must advance lastFrameTime by exactly cappedDt seconds).
    const syntheticNow = this.lastFrameTime + cappedDt * 1000;
    const result = this._tick(syntheticNow);
    return result.finally(() => {
      this._advancing = false;
    });
  }

  /**
   * Manually advance one frame by absolute timestamp — used by internal RAF loop.
   * @param now High-resolution timestamp (e.g. from `performance.now()`).
   * @internal
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

    await this.hooks.callHook('engine:start');

    if (this.config.loop === 'external') {
      // External mode: do not start RAF — caller drives the loop via advance(delta).
      if (this.config.debug) {
        console.log(
          '[GWEN] Engine started in external loop mode — call engine.advance(delta) each frame.',
        );
      }
      return;
    }

    // Internal mode: own the RAF loop.
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

    await this.hooks.callHook('engine:stop');
  }

  public async _tick(now: number): Promise<void> {
    this._updateFrameState(now);
    await this._phaseEngineTick();
    await this._phaseBeforeUpdate();
    this._phasePhysicsStep();
    await this._phaseWasmPluginsStep();
    this._phaseEcsTick();
    await this._phaseUpdate();
    await this._phaseRender();
  }

  /** Update delta time, FPS counter and propagate state to the API. @internal */
  private _updateFrameState(now: number): void {
    this._deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    this._frameCount++;
    if (this._frameCount % 60 === 0) {
      this.fps = this._deltaTime > 0 ? Math.round(1 / this._deltaTime) : 0;
    }
    this.api._updateState(this._deltaTime, this._frameCount);
  }

  /** Fire the per-frame engine:tick hook. @internal */
  private async _phaseEngineTick(): Promise<void> {
    try {
      await this.hooks.callHook('engine:tick', this._deltaTime);
    } catch (err) {
      console.error('[GWEN] Error in engine:tick hook:', err);
    }
  }

  /** Phase 1 — input capture (TS plugins onBeforeUpdate). @internal */
  private async _phaseBeforeUpdate(): Promise<void> {
    await this.pluginManager.dispatchBeforeUpdate(this.api, this._deltaTime, this.hooks);
  }

  /** Phase 2 — physics step via WASM core (Rapier lives inside gwen_core, no SAB sync needed). @internal */
  private _phasePhysicsStep(): void {
    if (this.wasmBridge.hasPhysics()) {
      this.pluginManager.dispatchPhysicsStep(this._deltaTime, this.api);
    }
  }

  /** Phase 3 — third-party WASM plugins via SharedArrayBuffer path. @internal */
  private async _phaseWasmPluginsStep(): Promise<void> {
    const hasThirdPartyWasm = this.pluginManager.wasmPluginCount() > 0;
    if (this.sharedMemoryPtr === 0 || !hasThirdPartyWasm) return;

    // Sync ECS transforms → shared buffer
    if (this.config.sparseTransformSync) {
      const dirtyCount = this.wasmBridge.dirtyTransformCount();
      if (dirtyCount > 0) {
        this.wasmBridge.syncTransformsToBufferSparse(this.sharedMemoryPtr);
        this.wasmBridge.clearTransformDirty();
      }
    } else {
      this.wasmBridge.syncTransformsToBuffer(this.sharedMemoryPtr, this.sharedMemoryMaxEntities);
    }

    // Reset ring-buffers so WASM plugins write fresh events this frame
    this.pluginDataBus?.resetEventChannels();

    // Run each WASM plugin's simulation step
    this.pluginManager.dispatchWasmStep(this._deltaTime, this.api, this.hooks);

    // Sentinel integrity check (debug mode only)
    if (this.config.debug && this.sharedMemoryManager !== null) {
      this.sharedMemoryManager.checkSentinels(this.wasmBridge);
    }
    if (this.config.debug && this.pluginDataBus !== null) {
      this.pluginDataBus.checkSentinels();
    }

    // Sync shared buffer → ECS transforms (WASM plugins may have written new positions)
    this.wasmBridge.syncTransformsFromBuffer(this.sharedMemoryPtr, this.sharedMemoryMaxEntities);
  }

  /** Phase 4 — Rust ECS maintenance tick. @internal */
  private _phaseEcsTick(): void {
    this.wasmBridge.tick(this._deltaTime * 1000);
  }

  /** Phase 5 — game logic (TS plugins onUpdate). @internal */
  private async _phaseUpdate(): Promise<void> {
    await this.pluginManager.dispatchUpdate(this.api, this._deltaTime, this.hooks);
  }

  /** Phase 6 — rendering (TS plugins onRender). @internal */
  private async _phaseRender(): Promise<void> {
    await this.pluginManager.dispatchRender(this.api, this.hooks);
  }
}
