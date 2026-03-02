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

import type { EngineConfig, TsPlugin, ComponentType } from './types';
import { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api';
import { PluginManager } from './plugin-manager';
import { defaultConfig, mergeConfigs } from './config';
import { getWasmBridge, type WasmBridge, type WasmEntityId } from './wasm-bridge';
import { type ComponentDefinition, type ComponentSchema, computeSchemaLayout, type SchemaLayout } from './schema';
import type { EntityManager, ComponentRegistry, QueryEngine, EntityId as EcsEntityId } from './ecs';

// EntityId est maintenant un packed number (index | generation<<20) aligné sur le format Rust
export type EntityId = number;

// ── Interfaces des shims WASM ────────────────────────────────────────────────

/** Shim qui satisfait l'interface EntityManager attendue par createEngineAPI */
interface EntityManagerShim extends Pick<EntityManager, 'count' | 'maxEntities'> {
  create(): EntityId;
  destroy(id: EntityId): boolean;
  isAlive(id: EntityId): boolean;
  [Symbol.iterator](): Iterator<EntityId>;
}

/** Shim qui satisfait l'interface ComponentRegistry attendue par createEngineAPI */
interface ComponentRegistryShim extends Pick<ComponentRegistry, 'removeAll' | 'registeredTypes'> {
  add<T>(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType, data: T): void;
  remove(id: EntityId, type: ComponentType): boolean;
  get<T>(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType): T | undefined;
  has(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType): boolean;
}

/** Shim qui satisfait l'interface QueryEngine attendue par createEngineAPI */
interface QueryEngineShim extends Pick<QueryEngine, 'invalidate'> {
  query(required: ComponentType[], entities: EntityManagerShim, components: ComponentRegistryShim): EntityId[];
}

/** Interface minimale d'un plugin legacy (avant registerSystem) */
interface LegacyPlugin {
  init?(engine: Engine): void;
}

// ── Helpers packed EntityId ──────────────────────────────────────────────────

function packId(wasmId: WasmEntityId): EntityId {
  return (wasmId.generation << 20) | (wasmId.index & 0xFFFFF);
}

function unpackId(id: EntityId): { index: number; generation: number } {
  return { index: id & 0xFFFFF, generation: id >>> 20 };
}

// ── Type interne de layout ───────────────────────────────────────────────────

/** Valeur JS possible d'un champ de composant sérialisé */
type ComponentFieldValue = number | bigint | boolean | string;

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

  // WASM Bridge — obligatoire
  private wasmBridge: WasmBridge;

  // Mapping composant string → typeId numérique Rust
  private componentTypeIds = new Map<ComponentType, number>();

  // Layout cache pour la sérialisation binaire accélérée
  private schemaLayouts = new Map<ComponentType, SchemaLayout<Record<string, ComponentFieldValue>>>();
  // Scratchpad global pour la serialisation (zero-alloc)
  private scratchBuffer = new ArrayBuffer(1024); // 1KB suffit amplement pour un seul composant
  private scratchDataView = new DataView(this.scratchBuffer);

  // Event system
  private eventListeners = new Map<string, Set<(data?: unknown) => void>>();

  constructor(userConfig?: Partial<EngineConfig>) {
    this.config = mergeConfigs(defaultConfig, userConfig || {});
    this.validateConfig();

    this.wasmBridge = getWasmBridge();

    // En test, le mock est injecté avant la construction — on accepte.
    // En production, start() vérifie que isActive() est true.

    // Wire up the API — les méthodes ECS délèguent au WASM bridge
    const entityShim: EntityManagerShim = {
      create: () => {
        const wid = this.wasmBridge.createEntity();
        return packId(wid);
      },
      destroy: (id: EntityId) => {
        const { index, generation } = unpackId(id);
        return this.wasmBridge.deleteEntity(index, generation);
      },
      isAlive: (id: EntityId) => {
        const { index, generation } = unpackId(id);
        return this.wasmBridge.isAlive(index, generation);
      },
      count: () => this.wasmBridge.countEntities(),
      maxEntities: this.config.maxEntities,
      [Symbol.iterator]: function* () { /* queries via bridge */ },
    };

    const componentShim: ComponentRegistryShim = {
      add: <T>(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType, data: T) => {
        this._addComponentInternal(id, type, data);
      },
      remove: (id: EntityId, type: ComponentType) => {
        const typeId = this.componentTypeIds.get(type);
        if (typeId === undefined) return false;
        const { index, generation } = unpackId(id);
        const ok = this.wasmBridge.removeComponent(index, generation, typeId);
        if (ok) {
          this.wasmBridge.updateEntityArchetype(index, this._getEntityTypeIds(id));
        }
        return ok;
      },
      get: <T>(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType): T | undefined => {
        const typeName = typeof type === 'string' ? type : type.name;
        const typeId = this.componentTypeIds.get(typeName);
        if (typeId === undefined) return undefined;
        const { index, generation } = unpackId(id);
        const raw = this.wasmBridge.getComponentRaw(index, generation, typeId);
        if (raw.length === 0) return undefined;
        return this._deserializeComponent(typeName, raw) as T;
      },
      has: (id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType) => {
        const typeName = typeof type === 'string' ? type : type.name;
        const typeId = this.componentTypeIds.get(typeName);
        if (typeId === undefined) return false;
        const { index, generation } = unpackId(id);
        return this.wasmBridge.hasComponent(index, generation, typeId);
      },
      removeAll: (id: EntityId) => {
        const { index, generation } = unpackId(id);
        for (const [, typeId] of this.componentTypeIds) {
          this.wasmBridge.removeComponent(index, generation, typeId);
        }
      },
      registeredTypes: () => [...this.componentTypeIds.keys()],
    };

    const queryShim: QueryEngineShim = {
      query: (required: ComponentType[]) => {
        const typeIds = required.map(t => this._getOrRegisterTypeId(t));
        return this.wasmBridge.queryEntities(typeIds);
      },
      invalidate: () => { /* géré par le WASM */ },
    };

    this.api = createEngineAPI(
      entityShim as unknown as EntityManager,
      componentShim as unknown as ComponentRegistry,
      queryShim as unknown as QueryEngine,
      new ServiceLocator(),
    ) as EngineAPIImpl;

    this.pluginManager = new PluginManager();

    this.api.services.register<import('./types').IPluginRegistrar>('PluginRegistrar', {
      register: (plugin) => this.pluginManager.register(plugin, this.api),
      unregister: (name) => this.pluginManager.unregister(name),
      get: <T extends TsPlugin>(name: string) => this.pluginManager.get<T>(name),
    });

    if (this.config.debug) {
      console.log('[GWEN] Engine initialized', this.config);
      if (this.wasmBridge.isActive()) {
        console.log('[GWEN] WASM core ready');
      } else {
        console.warn('[GWEN] WASM core not yet initialized — appelez initWasm() avant start()');
      }
    }
  }

  // ── Communication binaire TS -> Rust ────────────────────────────────────────

  private _addComponentInternal(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType, data: unknown): void {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this._getOrRegisterTypeId(typeName);
    const def: ComponentDefinition<ComponentSchema> = typeof type === 'string'
      ? { name: type, schema: {} }
      : type;
    this._getOrComputeLayout(def);
    const bytes = this._serializeComponent(typeName, data);
    const { index, generation } = unpackId(id);
    this.wasmBridge.addComponent(index, generation, typeId, bytes);
    this.wasmBridge.updateEntityArchetype(index, this._getEntityTypeIds(id));
  }

  private _serializeComponent(componentId: string, data: unknown): Uint8Array {
    const layout = this.schemaLayouts.get(componentId);

    if (!layout) {
      throw new Error(
        `[GWEN] Composant "${componentId}" n'a pas de layout enregistré. ` +
        `Définissez-le avec defineComponent({ name: "${componentId}", schema: { ... } }).`
      );
    }
    if (layout.byteLength === 0) {
      throw new Error(
        `[GWEN] Composant "${componentId}" a un schema vide (byteLength === 0). ` +
        `Passez la ComponentDefinition complète (defineComponent) au lieu d'une simple string.`
      );
    }
    if (this.scratchBuffer.byteLength < layout.byteLength) {
      this.scratchBuffer = new ArrayBuffer(layout.byteLength);
      this.scratchDataView = new DataView(this.scratchBuffer);
    }
    const bytesWritten = layout.serialize!(data as Record<string, ComponentFieldValue>, this.scratchDataView);
    return new Uint8Array(this.scratchBuffer, 0, bytesWritten);
  }

  private _deserializeComponent(componentId: string, raw: Uint8Array): Record<string, ComponentFieldValue> {
    const layout = this.schemaLayouts.get(componentId);
    if (!layout) {
      throw new Error(`[GWEN] Impossible de désérialiser "${componentId}" : layout absent.`);
    }
    if (layout.byteLength === 0) {
      throw new Error(`[GWEN] Composant "${componentId}" a un schema vide (byteLength === 0).`);
    }
    if (this.scratchBuffer.byteLength < layout.byteLength) {
      this.scratchBuffer = new ArrayBuffer(layout.byteLength);
      this.scratchDataView = new DataView(this.scratchBuffer);
    }
    const localBuf = new Uint8Array(this.scratchBuffer, 0, layout.byteLength);
    localBuf.set(raw.subarray(0, layout.byteLength));
    return layout.deserialize!(this.scratchDataView) as Record<string, ComponentFieldValue>;
  }

  private _getOrComputeLayout(def: ComponentDefinition<ComponentSchema>): SchemaLayout<Record<string, ComponentFieldValue>> {
    let layout = this.schemaLayouts.get(def.name);
    if (!layout) {
      layout = computeSchemaLayout<Record<string, ComponentFieldValue>>(def.schema);
      this.schemaLayouts.set(def.name, layout);
    }
    return layout;
  }

  private _getOrRegisterTypeId(type: ComponentType): number {
    let typeId = this.componentTypeIds.get(type);
    if (typeId === undefined) {
      typeId = this.wasmBridge.registerComponentType();
      this.componentTypeIds.set(type, typeId);
    }
    return typeId;
  }

  private _getEntityTypeIds(id: EntityId): number[] {
    const { index, generation } = unpackId(id);
    const result: number[] = [];
    for (const [, typeId] of this.componentTypeIds) {
      if (this.wasmBridge.hasComponent(index, generation, typeId)) {
        result.push(typeId);
      }
    }
    return result;
  }

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
   */
  public registerSystem(plugin: TsPlugin): this {
    this.pluginManager.register(plugin, this.api);
    if (this.config.debug) {
      console.log(`[GWEN] Plugin '${plugin.name}' registered`);
    }
    return this;
  }

  /** Get a registered plugin by name */
  public getSystem<T extends TsPlugin>(name: string): T | undefined {
    return this.pluginManager.get<T>(name);
  }

  /** Check if a plugin is registered */
  public hasSystem(name: string): boolean {
    return this.pluginManager.has(name);
  }

  /** Remove a plugin by name, calling its onDestroy */
  public removeSystem(name: string): boolean {
    return this.pluginManager.unregister(name);
  }

  /**
   * Legacy plugin loader (backward compat).
   * Prefer registerSystem() for TsPlugins.
   * @deprecated Use registerSystem() instead
   */
  private legacyPlugins: Map<string, unknown> = new Map();

  /** @deprecated Use registerSystem() instead */
  public loadPlugin(name: string, plugin: unknown): void {
    if (this.legacyPlugins.has(name)) return;
    try {
      const legacy = plugin as LegacyPlugin;
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

  // ============= Lifecycle =============

  public start(): void {
    if (this.isRunning) return;

    if (!this.wasmBridge.isActive()) {
      throw new Error(
        '[GWEN] Impossible de démarrer : le core WASM n\'est pas initialisé.\n' +
        'Appelez `await initWasm()` avant engine.start().'
      );
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.emit('start');

    const loop = (now: number) => {
      this.tick(now);
      if (this.isRunning) this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.isRunning) cancelAnimationFrame(this.rafHandle);
    this.isRunning = false;
    this.pluginManager.destroyAll();
    this.emit('stop');
  }

  private tick(now: number): void {
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
    // Retirer du query cache Rust — sinon l'entité détruite continue d'apparaître dans les queries
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

  public removeComponent(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType): boolean {
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

  public hasComponent(id: EntityId, type: ComponentDefinition<ComponentSchema> | ComponentType): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    const typeId = this.componentTypeIds.get(typeName);
    if (typeId === undefined) return false;
    const { index, generation } = unpackId(id);
    return this.wasmBridge.hasComponent(index, generation, typeId);
  }

  // ============= Query System =============

  public query(componentTypes: ComponentType[]): EntityId[] {
    const typeIds = componentTypes.map(t => this._getOrRegisterTypeId(t));
    return this.wasmBridge.queryEntities(typeIds);
  }

  public queryWith(componentTypes: ComponentType[], filter?: (id: EntityId) => boolean): EntityId[] {
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

  private emit(eventType: string, data?: unknown): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(data); } catch (error) {
          console.error(`[GWEN] Error in '${eventType}' listener:`, error);
        }
      }
    }
  }

  // ============= Stats & Debug =============

  public getFPS(): number { return this.fps; }
  public getDeltaTime(): number { return this._deltaTime; }
  public getFrameCount(): number { return this._frameCount; }
  public getConfig(): EngineConfig { return { ...this.config }; }

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

  public getWasmBridge(): WasmBridge { return this.wasmBridge; }
  public getAPI(): EngineAPIImpl { return this.api; }
}

// ============= Global Instance =============

let globalEngine: Engine | null = null;

export function getEngine(config?: Partial<EngineConfig>): Engine {
  if (!globalEngine) globalEngine = new Engine(config);
  return globalEngine;
}

export function useEngine(): Engine {
  if (!globalEngine) throw new Error('[GWEN] Engine not initialized. Call getEngine() first.');
  return globalEngine;
}

export function resetEngine(): void {
  globalEngine = null;
}

