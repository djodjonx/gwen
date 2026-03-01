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
import { EntityManager, ComponentRegistry, QueryEngine, type EntityId } from './ecs';
import { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api';
import { PluginManager } from './plugin-manager';
import { defaultConfig, mergeConfigs } from './config';

export class Engine {
  private config: EngineConfig;
  private isRunning = false;
  private _frameCount = 0;
  private lastFrameTime = 0;
  private _deltaTime = 0;
  private fps = 0;
  private rafHandle = 0;

  // ECS
  private entityManager: EntityManager;
  private componentRegistry: ComponentRegistry;
  private queryEngine: QueryEngine;

  // Plugin system (single source of truth)
  private pluginManager: PluginManager;
  private api: EngineAPIImpl;

  // Event system
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(userConfig?: Partial<EngineConfig>) {
    this.config = mergeConfigs(defaultConfig, userConfig || {});
    this.validateConfig();

    this.entityManager = new EntityManager(this.config.maxEntities);
    this.componentRegistry = new ComponentRegistry();
    this.queryEngine = new QueryEngine();

    // Wire up the API with a fresh ServiceLocator
    this.api = createEngineAPI(
      this.entityManager,
      this.componentRegistry,
      this.queryEngine,
      new ServiceLocator(),
    ) as EngineAPIImpl;

    this.pluginManager = new PluginManager();

    // Register PluginRegistrar to allow Scenes (and other plugins) to mount sub-plugins
    this.api.services.register<import('./types').IPluginRegistrar>('PluginRegistrar', {
      register: (plugin) => this.pluginManager.register(plugin, this.api),
      unregister: (name) => this.pluginManager.unregister(name),
      get: <T extends import('./types').TsPlugin>(name: string) => this.pluginManager.getPlugin(name) as T | undefined,
    });

    if (this.config.debug) {
      console.log('[GWEN] Engine initialized', this.config);
    }
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
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.emit('start');

    const loop = (now: number) => {
      this.tick(now);
      if (this.isRunning) {
        this.rafHandle = requestAnimationFrame(loop);
      }
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.isRunning) {
      cancelAnimationFrame(this.rafHandle);
    }
    this.isRunning = false;

    // Destroy all TsPlugins (in reverse order via PluginManager)
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

    // Update shared API state
    this.api._updateState(this._deltaTime, this._frameCount);

    // ── Game loop order (ENGINE.md §9) ──────────────────────────────────
    // 1. Inputs & intentions
    this.pluginManager.dispatchBeforeUpdate(this.api, this._deltaTime);

    // 2. (WASM plugins slot — physics, AI — future integration)

    // 3. Game logic on updated values
    this.pluginManager.dispatchUpdate(this.api, this._deltaTime);

    // 4. Drawing — Canvas2DRenderer (or any renderer plugin) runs here
    this.pluginManager.dispatchRender(this.api);

    this.emit('update', { deltaTime: this._deltaTime, frameCount: this._frameCount });
  }

  // ============= Entity Management (direct API) =============

  public createEntity(): EntityId {
    const id = this.entityManager.create();
    this.emit('entityCreated', { id });
    return id;
  }

  public destroyEntity(id: EntityId): boolean {
    if (!this.entityManager.isAlive(id)) return false;
    this.componentRegistry.removeAll(id);
    const result = this.entityManager.destroy(id);
    this.queryEngine.invalidate();
    this.emit('entityDestroyed', { id });
    return result;
  }

  public entityExists(id: EntityId): boolean {
    return this.entityManager.isAlive(id);
  }

  public getEntityCount(): number {
    return this.entityManager.count();
  }

  // ============= Component Management (direct API) =============

  public addComponent<T>(id: EntityId, type: ComponentType, data: T): void {
    this.componentRegistry.add(id, type, data);
    this.queryEngine.invalidate();
    this.emit('componentAdded', { id, type });
  }

  public removeComponent(id: EntityId, type: ComponentType): boolean {
    const result = this.componentRegistry.remove(id, type);
    if (result) {
      this.queryEngine.invalidate();
      this.emit('componentRemoved', { id, type });
    }
    return result;
  }

  public getComponent<T>(id: EntityId, type: ComponentType): T | undefined {
    return this.componentRegistry.get<T>(id, type);
  }

  public hasComponent(id: EntityId, type: ComponentType): boolean {
    return this.componentRegistry.has(id, type);
  }

  // ============= Query System (direct API) =============

  public query(componentTypes: ComponentType[]): EntityId[] {
    return this.queryEngine.query(componentTypes, this.entityManager, this.componentRegistry);
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

  public on(eventType: string, listener: Function): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
  }

  public off(eventType: string, listener: Function): void {
    this.eventListeners.get(eventType)?.delete(listener);
  }

  private emit(eventType: string, data?: unknown): void {
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

  public getFPS(): number { return this.fps; }
  public getDeltaTime(): number { return this._deltaTime; }
  public getFrameCount(): number { return this._frameCount; }
  public getConfig(): EngineConfig { return { ...this.config }; }

  public getStats() {
    return {
      fps: this.fps,
      frameCount: this._frameCount,
      deltaTime: this._deltaTime,
      entityCount: this.entityManager.count(),
      isRunning: this.isRunning,
    };
  }

  /** Expose the EngineAPI for advanced plugin scenarios */
  public getAPI(): EngineAPIImpl {
    return this.api;
  }
}

// ============= Global Instance =============

let globalEngine: Engine | null = null;

export function getEngine(config?: Partial<EngineConfig>): Engine {
  if (!globalEngine) {
    globalEngine = new Engine(config);
  }
  return globalEngine;
}

export function useEngine(): Engine {
  if (!globalEngine) {
    throw new Error('[GWEN] Engine not initialized. Call getEngine() first.');
  }
  return globalEngine;
}

export function resetEngine(): void {
  globalEngine = null;
}
