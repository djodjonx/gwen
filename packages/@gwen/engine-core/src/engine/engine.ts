/**
 * GWEN Engine — Main class
 *
 * Orchestrates ECS, plugins, and the game loop.
 * Uses PluginManager for all plugin lifecycle management.
 * Rendering is handled by a TsPlugin (Canvas2DRenderer) — no special casing.
 *
 * @example
 * ```typescript
 * import { Engine, Canvas2DRenderer } from '@gwen/engine-core';
 *
 * const engine = new Engine({ maxEntities: 5000, targetFPS: 60 });
 *
 * // Register the renderer as a plugin — just like any other
 * engine.registerSystem(new Canvas2DRenderer({ canvas: 'game' }));
 *
 * engine.start();
 * ```
 */

import type { EngineConfig, TsPlugin, ComponentType, GwenWasmPlugin } from '../types';
import { ServiceLocator, EngineAPIImpl, createEngineAPI } from '../api/api';
import { PluginManager } from '../plugin-system/plugin-manager';
import { defaultConfig, mergeConfigs } from '../config/config';
import { getWasmBridge, type WasmBridge } from './wasm-bridge';
import type { SharedMemoryManager } from '../wasm/shared-memory';
import type { PluginDataBus } from '../wasm/plugin-data-bus';
import {
  type ComponentDefinition,
  type ComponentSchema,
  computeSchemaLayout,
  type SchemaLayout,
} from '../schema';
import type { EntityManager, ComponentRegistry, QueryEngine } from '../core/ecs';
import {
  packId,
  unpackId,
  type EntityId,
  type ComponentFieldValue,
  createShims,
} from './engine-api';
import { createGwenHooks, type GwenHookable } from '../hooks';

export class Engine {
  private config: EngineConfig;
  private isRunning = false;
  private _frameCount = 0;
  private lastFrameTime = 0;
  private _deltaTime = 0;
  private fps = 0;
  private rafHandle = 0;

  // Plugin system
  private pluginManager: PluginManager;
  private api: EngineAPIImpl<GwenDefaultServices, GwenDefaultHooks>;

  // Hooks system — unified event & lifecycle management
  public readonly hooks: GwenHookable<GwenDefaultHooks> = createGwenHooks<GwenDefaultHooks>();

  // WASM Bridge — mandatory
  private wasmBridge: WasmBridge;

  // Shared memory pointer for WASM plugins (set by _setSharedMemoryPtr)
  private sharedMemoryPtr = 0;
  private sharedMemoryMaxEntities = 0;
  /**
   * Reference to the SharedMemoryManager — kept for sentinel checks in debug mode.
   * Set by `_setSharedMemoryManager()` called from `createEngine()`.
   */
  private sharedMemoryManager: SharedMemoryManager | null = null;

  /** Plugin Data Bus — JS-native buffers for channel-based WASM ↔ TS communication. */
  private pluginDataBus: PluginDataBus | null = null;

  // Component type string → Rust numeric typeId mapping
  private componentTypeIds = new Map<ComponentType, number>();

  // Layout cache for accelerated binary serialization
  private schemaLayouts = new Map<
    ComponentType,
    SchemaLayout<Record<string, ComponentFieldValue>>
  >();
  // Scratch buffer for serialization (zero-alloc)
  private scratchBuffer = new ArrayBuffer(1024);
  private scratchDataView = new DataView(this.scratchBuffer);

  constructor(userConfig?: Partial<EngineConfig>) {
    this.config = mergeConfigs(defaultConfig, userConfig || {});
    this.validateConfig();

    this.wasmBridge = getWasmBridge();

    // Wire up the API — ECS methods delegate to WASM bridge
    const { entityShim, componentShim, queryShim } = createShims(this);

    this.api = createEngineAPI(
      entityShim as unknown as EntityManager,
      componentShim as unknown as ComponentRegistry,
      queryShim as unknown as QueryEngine,
      new ServiceLocator(),
      this.hooks,
    ) as EngineAPIImpl;

    this.pluginManager = new PluginManager();

    // Inject PluginRegistrar directly into services for dynamic late-registration
    this.api.services.register('PluginRegistrar', {
      register: (plugin: TsPlugin) => this.pluginManager.register(plugin, this.api, this.hooks),
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

    // Call engine:init hook (synchronous)
    try {
      this.hooks.callHook('engine:init');
    } catch (err) {
      console.error('[GWEN] Error in engine:init hook:', err);
    }
  }

  // ── Binary communication TS → Rust ────────────────────────────────────────

  /**
   * Internal: add a component to an entity and serialize it to WASM.
   * @internal
   */
  public _addComponentInternal(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
    data: unknown,
  ): void {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this._getOrRegisterTypeId(typeName);
    const def: ComponentDefinition<ComponentSchema> =
      typeof type === 'string' ? { name: type, schema: {} } : type;
    this._getOrComputeLayout(def);
    const bytes = this._serializeComponent(typeName, data);
    const { index, generation } = unpackId(id);
    this.wasmBridge.addComponent(index, generation, typeId, bytes);
    this.wasmBridge.updateEntityArchetype(index, this._getEntityTypeIds(id));
  }

  /**
   * Serialize component data to binary using the schema layout.
   * @internal
   */
  public _serializeComponent(componentId: string, data: unknown): Uint8Array {
    const layout = this.schemaLayouts.get(componentId);

    if (!layout) {
      throw new Error(
        `[GWEN] Component "${componentId}" has no registered layout. ` +
          `Define it with defineComponent({ name: "${componentId}", schema: { ... } }).`,
      );
    }
    if (layout.byteLength === 0) {
      throw new Error(
        `[GWEN] Component "${componentId}" has empty schema (byteLength === 0). ` +
          `Pass the full ComponentDefinition (defineComponent) instead of a plain string.`,
      );
    }
    if (this.scratchBuffer.byteLength < layout.byteLength) {
      this.scratchBuffer = new ArrayBuffer(layout.byteLength);
      this.scratchDataView = new DataView(this.scratchBuffer);
    }
    const bytesWritten = layout.serialize!(
      data as Record<string, ComponentFieldValue>,
      this.scratchDataView,
    );
    return new Uint8Array(this.scratchBuffer, 0, bytesWritten);
  }

  /**
   * Deserialize component data from binary using the schema layout.
   * @internal
   */
  public _deserializeComponent(
    componentId: string,
    raw: Uint8Array,
  ): Record<string, ComponentFieldValue> {
    const layout = this.schemaLayouts.get(componentId);
    if (!layout) {
      throw new Error(`[GWEN] Cannot deserialize "${componentId}": layout missing.`);
    }
    if (layout.byteLength === 0) {
      throw new Error(`[GWEN] Component "${componentId}" has empty schema (byteLength === 0).`);
    }
    if (this.scratchBuffer.byteLength < layout.byteLength) {
      this.scratchBuffer = new ArrayBuffer(layout.byteLength);
      this.scratchDataView = new DataView(this.scratchBuffer);
    }
    const localBuf = new Uint8Array(this.scratchBuffer, 0, layout.byteLength);
    localBuf.set(raw.subarray(0, layout.byteLength));
    return layout.deserialize!(this.scratchDataView) as Record<string, ComponentFieldValue>;
  }

  /**
   * Get or compute schema layout for a component definition.
   * @internal
   */
  public _getOrComputeLayout(
    def: ComponentDefinition<ComponentSchema>,
  ): SchemaLayout<Record<string, ComponentFieldValue>> {
    let layout = this.schemaLayouts.get(def.name);
    if (!layout) {
      layout = computeSchemaLayout<Record<string, ComponentFieldValue>>(def.schema);
      this.schemaLayouts.set(def.name, layout);
    }
    return layout;
  }

  /**
   * Get or register a Rust component type ID for a component type name.
   * @internal
   */
  public _getOrRegisterTypeId(type: ComponentType): number {
    let typeId = this.componentTypeIds.get(type);
    if (typeId === undefined) {
      typeId = this.wasmBridge.registerComponentType();
      this.componentTypeIds.set(type, typeId);
    }
    return typeId;
  }

  /**
   * Get component type ID for a registered component type.
   * @internal - Used by engine-api shims
   */
  public _getComponentTypeId(type: ComponentType): number | undefined {
    return this.componentTypeIds.get(type);
  }

  /**
   * Get all component type IDs as a Map.
   * @internal - Used by engine-api shims
   */
  public _getComponentTypeIds(): ReadonlyMap<ComponentType, number> {
    return this.componentTypeIds;
  }

  /**
   * Get all type IDs currently on an entity.
   * @internal
   */
  public _getEntityTypeIds(id: EntityId): number[] {
    const { index, generation } = unpackId(id);
    const result: number[] = [];
    for (const [, typeId] of this.componentTypeIds) {
      if (this.wasmBridge.hasComponent(index, generation, typeId)) {
        result.push(typeId);
      }
    }
    return result;
  }

  /**
   * Validate engine configuration.
   * @internal
   */
  private validateConfig(): void {
    if (this.config.maxEntities < 100) {
      throw new Error('[GWEN] maxEntities must be at least 100');
    }
    if (this.config.targetFPS < 1 || this.config.targetFPS > 300) {
      throw new Error('[GWEN] targetFPS must be between 1 and 300');
    }
  }

  // ============= Plugin System =============

  /**
   * Register a TsPlugin — it will participate in the game loop lifecycle.
   * The renderer is just another plugin: `engine.registerSystem(new Canvas2DRenderer(...))`.
   * Calls onInit immediately with the EngineAPI.
   *
   * @param plugin The plugin to register
   * @returns this for chaining
   */
  public registerSystem(plugin: TsPlugin): this {
    this.pluginManager.register(plugin, this.api, this.hooks);
    if (this.config.debug) {
      console.log(`[GWEN] Plugin '${plugin.name}' registered`);
    }
    return this;
  }

  /**
   * Get a registered plugin by name.
   *
   * @param name Plugin name
   * @returns The plugin, or undefined if not found
   */
  public getSystem<T extends TsPlugin>(name: string): T | undefined {
    return this.pluginManager.get<T>(name);
  }

  /**
   * Check if a plugin is registered.
   *
   * @param name Plugin name
   * @returns true if registered
   */
  public hasSystem(name: string): boolean {
    return this.pluginManager.has(name);
  }

  /**
   * Remove a plugin by name, calling its onDestroy.
   *
   * @param name Plugin name
   * @returns true if unregistered, false if not found
   */
  public removeSystem(name: string): boolean {
    return this.pluginManager.unregister(name, this.hooks);
  }

  /**
   * Legacy plugin loader (backward compatibility).
   * Prefer registerSystem() for TsPlugins.
   * @deprecated Use registerSystem() instead
   */
  private legacyPlugins: Map<string, unknown> = new Map();

  /**
   * @deprecated Use registerSystem() instead
   */
  public loadPlugin(name: string, plugin: unknown): void {
    if (this.legacyPlugins.has(name)) return;
    try {
      const legacy = plugin as { init?: (engine: Engine) => void };
      if (typeof legacy.init === 'function') {
        legacy.init(this);
      }
      this.legacyPlugins.set(name, plugin);
    } catch (error) {
      console.error(`[GWEN] Failed to load plugin '${name}':`, error);
    }
  }

  public getPlugin(name: string): unknown {
    return this.legacyPlugins.get(name);
  }

  public hasPlugin(name: string): boolean {
    return this.legacyPlugins.has(name);
  }

  // ============= Entity Management =============

  public async createEntity(): Promise<EntityId> {
    const wid = this.wasmBridge.createEntity();
    const id = packId(wid);

    // Call hook — plugins can transform the ID
    try {
      await this.hooks.callHook('entity:create', id);
    } catch (err) {
      console.error('[GWEN] Error in entity:create hook:', err);
    }

    return id;
  }

  public destroyEntity(id: EntityId): boolean {
    const { index, generation } = unpackId(id);
    if (!this.wasmBridge.isAlive(index, generation)) return false;

    // Call hook — plugins can cancel destruction by returning false
    // For now, hooks are informational only (cancellation can be added later if needed)
    this.hooks.callHook('entity:destroy', id);

    // Nettoyer tous les composants
    for (const [, typeId] of this.componentTypeIds) {
      this.wasmBridge.removeComponent(index, generation, typeId);
    }
    const result = this.wasmBridge.deleteEntity(index, generation);
    // Remove from Rust query cache — otherwise destroyed entity still appears in queries
    this.wasmBridge.removeEntityFromQuery(index);

    // Call hook after destruction (synchronous)
    try {
      this.hooks.callHook('entity:destroyed', id);
    } catch (err) {
      console.error('[GWEN] Error in entity:destroyed hook:', err);
    }

    return result;
  }

  public entityExists(id: EntityId): boolean {
    const { index, generation } = unpackId(id);
    return this.wasmBridge.isAlive(index, generation);
  }

  public getEntityCount(): number {
    return this.wasmBridge.countEntities();
  }

  // ============= Component Management =============

  /**
   * Ajoute un composant à une entité.
   */
  public addComponent<S extends ComponentSchema>(
    id: EntityId,
    type: ComponentDefinition<S> | ComponentType,
    data: S extends ComponentSchema ? { [K in keyof S]: unknown } : unknown,
  ): void {
    this._addComponentInternal(id, type, data);
    const typeName = typeof type === 'string' ? type : type.name;

    // Call hook (synchronous)
    try {
      this.hooks.callHook('component:add', id, typeName, data);
    } catch (err) {
      console.error('[GWEN] Error in component:add hook:', err);
    }
  }

  public removeComponent(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentTypeIds.get(typeName);
    if (typeId === undefined) return false;

    // Call hook before removal
    this.hooks.callHook('component:remove', id, typeName);

    const { index, generation } = unpackId(id);
    const result = this.wasmBridge.removeComponent(index, generation, typeId);
    if (result) {
      this.wasmBridge.updateEntityArchetype(index, this._getEntityTypeIds(id));

      // Call hook after removal (synchronous)
      try {
        this.hooks.callHook('component:removed', id, typeName);
      } catch (err) {
        console.error('[GWEN] Error in component:removed hook:', err);
      }
    }
    return result;
  }

  /**
   * Récupère un composant d'une entité.
   */
  public getComponent<T extends Record<string, ComponentFieldValue>>(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): T | undefined {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentTypeIds.get(typeName);
    if (typeId === undefined) return undefined;
    const { index, generation } = unpackId(id);
    const raw = this.wasmBridge.getComponentRaw(index, generation, typeId);
    if (raw.length === 0) return undefined;
    return this._deserializeComponent(typeName, raw) as T;
  }

  public hasComponent(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentTypeIds.get(typeName);
    if (typeId === undefined) return false;
    const { index, generation } = unpackId(id);
    return this.wasmBridge.hasComponent(index, generation, typeId);
  }

  // ============= Query System =============

  public query(componentTypes: ComponentType[]): EntityId[] {
    const typeIds = componentTypes.map((t) => this._getOrRegisterTypeId(t));
    return this.wasmBridge.queryEntities(typeIds);
  }

  public queryWith(
    componentTypes: ComponentType[],
    filter?: (id: EntityId) => boolean,
  ): EntityId[] {
    let results = this.query(componentTypes);
    if (filter) results = results.filter(filter);
    return results;
  }

  // ============= Event System (Legacy — Bridge to Hooks) =============

  /**
   * @deprecated Use engine.hooks.hook() instead
   * Legacy event listener registration — bridges to the hooks system.
   *
   * @example
   * ```typescript
   * // ❌ Old way (deprecated)
   * engine.on('entityCreated', (data) => { ... });
   *
   * // ✅ New way
   * engine.hooks.hook('entity:create', (id) => { ... });
   * ```
   */
  public on(eventType: string, listener: (data?: unknown) => void): void {
    if (this.config.debug) {
      console.warn(
        `[GWEN] engine.on('${eventType}') is deprecated. Use engine.hooks.hook() instead.`,
      );
    }
    // Bridge to hooks system using [key: string] allowlist in GwenHooks
    (this.hooks.hook as (name: string, handler: (data?: unknown) => void) => void)(
      eventType,
      listener,
    );
  }

  /**
   * @deprecated Use engine.hooks.removeHook() instead
   */
  public off(eventType: string, listener: (data?: unknown) => void): void {
    if (this.config.debug) {
      console.warn(
        `[GWEN] engine.off('${eventType}') is deprecated. Use engine.hooks.removeHook() instead.`,
      );
    }
    // Bridge to hooks system using [key: string] allowlist in GwenHooks
    (this.hooks.removeHook as (name: string, handler: (data?: unknown) => void) => void)(
      eventType,
      listener,
    );
  }

  /**
   * @deprecated Hooks are called automatically now
   * @internal
   */
  public emit(eventType: string, _data?: unknown): void {
    // No-op — hooks are called directly now
    if (this.config.debug) {
      console.warn(`[GWEN] engine.emit('${eventType}') is deprecated and has no effect.`);
    }
  }

  // ============= Stats & Debug =============

  public getFPS(): number {
    return this.fps;
  }

  public getDeltaTime(): number {
    return this._deltaTime;
  }

  public getFrameCount(): number {
    return this._frameCount;
  }

  public getConfig(): EngineConfig {
    return { ...this.config };
  }

  public getStats(): {
    fps: number;
    frameCount: number;
    deltaTime: number;
    entityCount: number;
    isRunning: boolean;
    wasmActive: boolean;
    wasmStats: unknown;
  } {
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

  public getWasmBridge(): WasmBridge {
    return this.wasmBridge;
  }

  public getAPI(): EngineAPIImpl {
    return this.api;
  }

  // ============= Lifecycle =============

  public start(): Promise<void> {
    return this._start();
  }

  public stop(): Promise<void> {
    return this._stop();
  }

  public tick(now: number): Promise<void> {
    return this._tick(now);
  }

  public async _start(): Promise<void> {
    if (this.isRunning) return;

    if (!this.wasmBridge.isActive()) {
      throw new Error(
        "[GWEN] Impossible de démarrer : le core WASM n'est pas initialisé.\n" +
          'Appelez `await initWasm()` avant engine.start().',
      );
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();

    // Call hook
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

    // Call hook
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

    // Call engine:tick hook
    try {
      await this.hooks.callHook('engine:tick', this._deltaTime);
    } catch (err) {
      console.error('[GWEN] Error in engine:tick hook:', err);
    }

    // Step 1 — TsPlugins: capture inputs, intentions
    await this.pluginManager.dispatchBeforeUpdate(this.api, this._deltaTime, this.hooks);

    // Step 2 — Sync ECS Transforms → shared buffer (so WASM plugins can read)
    if (this.sharedMemoryPtr !== 0) {
      this.wasmBridge.syncTransformsToBuffer(this.sharedMemoryPtr, this.sharedMemoryMaxEntities);
    }

    // Step 2b — Reset event ring-buffers so Rust plugins write fresh events this frame
    this.pluginDataBus?.resetEventChannels();

    // Step 3 — WASM plugins: physics, AI… (Rust simulation step)
    this.pluginManager.dispatchWasmStep(this._deltaTime);

    // Step 4 — Sentinel integrity check (debug mode only, O(n_plugins))
    // Placed after Rust has written to the buffer but before TS reads it back.
    // Any buffer overrun from a Rust plugin is caught here as an immediate error
    // rather than silently corrupting the ECS state.
    if (this.config.debug && this.sharedMemoryManager !== null) {
      this.sharedMemoryManager.checkSentinels(this.wasmBridge);
    }
    if (this.config.debug && this.pluginDataBus !== null) {
      this.pluginDataBus.checkSentinels();
    }

    // Step 5 — Sync shared buffer → ECS Transforms (WASM plugins wrote new positions)
    if (this.sharedMemoryPtr !== 0) {
      this.wasmBridge.syncTransformsFromBuffer(this.sharedMemoryPtr, this.sharedMemoryMaxEntities);
    }

    // Step 6 — Tick Rust game loop
    this.wasmBridge.tick(this._deltaTime * 1000);

    // Step 7 — TsPlugins: game logic on updated values
    await this.pluginManager.dispatchUpdate(this.api, this._deltaTime, this.hooks);

    // Step 8 — TsPlugins: rendering
    await this.pluginManager.dispatchRender(this.api, this.hooks);
  }

  public _getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  public _getWasmBridge(): WasmBridge {
    return this.wasmBridge;
  }

  /**
   * Set the shared memory pointer and manager for SAB sync each frame.
   *
   * Called by `createEngine()` after `SharedMemoryManager.create()`.
   * The manager reference is kept to call `checkSentinels()` in debug mode.
   *
   * @param ptr          Raw pointer into gwen-core's WASM linear memory.
   * @param maxEntities  Number of entity slots (must match `alloc_shared_buffer` call).
   * @param manager      SharedMemoryManager instance — used for sentinel checks.
   * @internal
   */
  public _setSharedMemoryPtr(ptr: number, maxEntities: number, manager: SharedMemoryManager): void {
    this.sharedMemoryPtr = ptr;
    this.sharedMemoryMaxEntities = maxEntities;
    this.sharedMemoryManager = manager;
  }

  /**
   * Register an already-initialized WASM plugin so it participates in the game loop.
   * Called by createEngine() after plugin.onInit() resolves.
   * @internal
   */
  public _registerWasmPlugin(plugin: GwenWasmPlugin): void {
    this.pluginManager.registerWasmPlugin(plugin);
  }

  /**
   * Set the Plugin Data Bus for channel-based WASM ↔ TS communication.
   * Called by `createEngine()` after all channels have been allocated.
   * @internal
   */
  public _setPluginDataBus(bus: PluginDataBus): void {
    this.pluginDataBus = bus;
  }
}

// ============= Global Instance =============

let globalEngine: Engine | null = null;

export function getEngine(userConfig?: Partial<EngineConfig>): Engine {
  if (!globalEngine) globalEngine = new Engine(userConfig);
  return globalEngine;
}

export function useEngine(): Engine {
  if (!globalEngine) throw new Error('[GWEN] Engine not initialized. Call getEngine() first.');
  return globalEngine;
}

export function resetEngine(): void {
  globalEngine = null;
}
