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

import type { EngineConfig, TsPlugin, ComponentType } from '../types';
import { ServiceLocator, EngineAPIImpl, createEngineAPI } from '../api/api';
import { PluginManager } from '../plugin-system/plugin-manager';
import { defaultConfig, mergeConfigs } from '../config/config';
import { getWasmBridge, type WasmBridge } from './wasm-bridge';
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
  private api: EngineAPIImpl;

  // WASM Bridge — mandatory
  private wasmBridge: WasmBridge;

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

  // Event system
  private eventListeners = new Map<string, Set<(data?: unknown) => void>>();

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
    ) as EngineAPIImpl;

    this.pluginManager = new PluginManager();

    // Inject PluginRegistrar directly into services for dynamic late-registration
    this.api.services.register('PluginRegistrar', {
      register: (plugin: TsPlugin) => this.pluginManager.register(plugin, this.api),
      unregister: (name: string) => this.pluginManager.unregister(name),
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
    this.pluginManager.register(plugin, this.api);
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
    return this.pluginManager.unregister(name);
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

  public createEntity(): EntityId {
    const wid = this.wasmBridge.createEntity();
    const id = packId(wid);
    this.emit('entityCreated', { id });
    return id;
  }

  public destroyEntity(id: EntityId): boolean {
    const { index, generation } = unpackId(id);
    if (!this.wasmBridge.isAlive(index, generation)) return false;
    // Nettoyer tous les composants
    for (const [, typeId] of this.componentTypeIds) {
      this.wasmBridge.removeComponent(index, generation, typeId);
    }
    const result = this.wasmBridge.deleteEntity(index, generation);
    // Remove from Rust query cache — otherwise destroyed entity still appears in queries
    this.wasmBridge.removeEntityFromQuery(index);
    this.emit('entityDestroyed', { id });
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
    this.emit('componentAdded', { id, type });
  }

  public removeComponent(
    id: EntityId,
    type: ComponentDefinition<ComponentSchema> | ComponentType,
  ): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentTypeIds.get(typeName);
    if (typeId === undefined) return false;
    const { index, generation } = unpackId(id);
    const result = this.wasmBridge.removeComponent(index, generation, typeId);
    if (result) {
      this.wasmBridge.updateEntityArchetype(index, this._getEntityTypeIds(id));
      this.emit('componentRemoved', { id, type });
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

  // ============= Event System =============

  public on(eventType: string, listener: (data?: unknown) => void): void {
    if (!this.eventListeners.has(eventType)) this.eventListeners.set(eventType, new Set());
    this.eventListeners.get(eventType)!.add(listener);
  }

  public off(eventType: string, listener: (data?: unknown) => void): void {
    this.eventListeners.get(eventType)?.delete(listener);
  }

  public emit(eventType: string, data?: unknown): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`[GWEN] Error in '${eventType}' listener:`, error);
        }
      }
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

  public start(): void {
    this._start();
  }

  public stop(): void {
    this._stop();
  }

  public tick(now: number): void {
    this._tick(now);
  }

  public _start(): void {
    if (this.isRunning) return;

    if (!this.wasmBridge.isActive()) {
      throw new Error(
        "[GWEN] Impossible de démarrer : le core WASM n'est pas initialisé.\n" +
          'Appelez `await initWasm()` avant engine.start().',
      );
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.emit('start');

    const loop = (now: number) => {
      this._tick(now);
      if (this.isRunning) this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  public _stop(): void {
    if (this.isRunning) cancelAnimationFrame(this.rafHandle);
    this.isRunning = false;
    this.pluginManager.destroyAll();
    this.emit('stop');
  }

  public _tick(now: number): void {
    this._deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    this._frameCount++;

    if (this._frameCount % 60 === 0) {
      this.fps = this._deltaTime > 0 ? Math.round(1 / this._deltaTime) : 0;
    }

    this.api._updateState(this._deltaTime, this._frameCount);

    this.pluginManager.dispatchBeforeUpdate(this.api, this._deltaTime);

    // Tick du core Rust — synchronise le game loop WASM avec le TS
    this.wasmBridge.tick(this._deltaTime * 1000);

    this.pluginManager.dispatchUpdate(this.api, this._deltaTime);
    this.pluginManager.dispatchRender(this.api);

    this.emit('update', { deltaTime: this._deltaTime, frameCount: this._frameCount });
  }

  public _getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  public _getWasmBridge(): WasmBridge {
    return this.wasmBridge;
  }
}

// ============= Global Instance =============

let globalEngine: Engine | null = null;

export function getEngine(userConfig?: any): Engine {
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
