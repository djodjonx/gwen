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

// EntityId est maintenant un packed number (index | generation<<20) aligné sur le format Rust
export type EntityId = number;

function packId(wasmId: WasmEntityId): EntityId {
  return (wasmId.generation << 20) | (wasmId.index & 0xFFFFF);
}

function unpackId(id: EntityId): { index: number; generation: number } {
  return { index: id & 0xFFFFF, generation: id >>> 20 };
}

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

  // Event system
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(userConfig?: Partial<EngineConfig>) {
    this.config = mergeConfigs(defaultConfig, userConfig || {});
    this.validateConfig();

    this.wasmBridge = getWasmBridge();

    // En test, le mock est injecté avant la construction — on accepte.
    // En production, start() vérifie que isActive() est true.

    // Wire up the API — les méthodes ECS délèguent au WASM
    this.api = createEngineAPI(
      // EntityManager shim → délègue au WASM bridge
      {
        create: () => {
          const wid = this.wasmBridge.createEntity();
          const id = packId(wid);
          return id;
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
      } as any,
      // ComponentRegistry shim → délègue au WASM bridge
      {
        add: <T>(id: EntityId, type: ComponentType, data: T) => {
          const typeId = this._getOrRegisterTypeId(type);
          const bytes = this._serialize(data);
          const { index, generation } = unpackId(id);
          this.wasmBridge.addComponent(index, generation, typeId, bytes);
          // Mettre à jour l'archetype dans le query cache Rust
          const currentTypes = this._getEntityTypeIds(id);
          this.wasmBridge.updateEntityArchetype(index, currentTypes);
        },
        remove: (id: EntityId, type: ComponentType) => {
          const typeId = this.componentTypeIds.get(type);
          if (typeId === undefined) return false;
          const { index, generation } = unpackId(id);
          const ok = this.wasmBridge.removeComponent(index, generation, typeId);
          if (ok) {
            const currentTypes = this._getEntityTypeIds(id);
            this.wasmBridge.updateEntityArchetype(index, currentTypes);
          }
          return ok;
        },
        get: <T>(id: EntityId, type: ComponentType): T | undefined => {
          const typeId = this.componentTypeIds.get(type);
          if (typeId === undefined) return undefined;
          const { index, generation } = unpackId(id);
          const raw = this.wasmBridge.getComponentRaw(index, generation, typeId);
          if (raw.length === 0) return undefined;
          return this._deserialize<T>(raw);
        },
        has: (id: EntityId, type: ComponentType) => {
          const typeId = this.componentTypeIds.get(type);
          if (typeId === undefined) return false;
          const { index, generation } = unpackId(id);
          return this.wasmBridge.hasComponent(index, generation, typeId);
        },
        removeAll: (id: EntityId) => {
          for (const [, typeId] of this.componentTypeIds) {
            const { index, generation } = unpackId(id);
            this.wasmBridge.removeComponent(index, generation, typeId);
          }
        },
        registeredTypes: () => [...this.componentTypeIds.keys()],
      } as any,
      // QueryEngine shim → délègue au WASM bridge
      {
        query: (required: ComponentType[], _entities: any, _components: any): EntityId[] => {
          const typeIds = required.map(t => this._getOrRegisterTypeId(t));
          // queryEntities retourne des EntityIds packés (generation << 20 | index)
          return this.wasmBridge.queryEntities(typeIds);
        },
        invalidate: () => { /* géré par le WASM */ },
      } as any,
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

  // ── Sérialisation JSON léger ──────────────────────────────────────────────

  private _serialize<T>(data: T): Uint8Array {
    const json = JSON.stringify(data);
    return new TextEncoder().encode(json);
  }

  private _deserialize<T>(bytes: Uint8Array): T {
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
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

  public loadPlugin(name: string, plugin: unknown): void {
    if (this.legacyPlugins.has(name)) return;
    try {
      if (typeof (plugin as any).init === 'function') {
        (plugin as any).init(this);
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

  public addComponent<T>(id: EntityId, type: ComponentType, data: T): void {
    const typeId = this._getOrRegisterTypeId(type);
    const { index, generation } = unpackId(id);
    const bytes = this._serialize(data);
    this.wasmBridge.addComponent(index, generation, typeId, bytes);
    const currentTypes = this._getEntityTypeIds(id);
    this.wasmBridge.updateEntityArchetype(index, currentTypes);
    this.emit('componentAdded', { id, type });
  }

  public removeComponent(id: EntityId, type: ComponentType): boolean {
    const typeId = this.componentTypeIds.get(type);
    if (typeId === undefined) return false;
    const { index, generation } = unpackId(id);
    const result = this.wasmBridge.removeComponent(index, generation, typeId);
    if (result) {
      const currentTypes = this._getEntityTypeIds(id);
      this.wasmBridge.updateEntityArchetype(index, currentTypes);
      this.emit('componentRemoved', { id, type });
    }
    return result;
  }

  public getComponent<T>(id: EntityId, type: ComponentType): T | undefined {
    const typeId = this.componentTypeIds.get(type);
    if (typeId === undefined) return undefined;
    const { index, generation } = unpackId(id);
    const raw = this.wasmBridge.getComponentRaw(index, generation, typeId);
    if (raw.length === 0) return undefined;
    return this._deserialize<T>(raw);
  }

  public hasComponent(id: EntityId, type: ComponentType): boolean {
    const typeId = this.componentTypeIds.get(type);
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

  public on(eventType: string, listener: Function): void {
    if (!this.eventListeners.has(eventType)) this.eventListeners.set(eventType, new Set());
    this.eventListeners.get(eventType)!.add(listener);
  }

  public off(eventType: string, listener: Function): void {
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
