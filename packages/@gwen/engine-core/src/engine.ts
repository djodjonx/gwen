/**
 * GWEN Engine — Main class
 *
 * Orchestrates ECS, plugins, and the game loop.
 * Rendering is handled by TsPlugin (Canvas2DRenderer).
 *
 * @example
 * ```typescript
 * const engine = new Engine({ maxEntities: 5000, targetFPS: 60 });
 * engine.registerSystem(new InputPlugin());
 * engine.start();
 * ```
 */

import type { EngineConfig, TsPlugin, EngineAPI, ServiceLocator, ComponentType } from './types';
import { EntityManager, ComponentRegistry, QueryEngine, type EntityId } from './ecs';
import { defaultConfig, mergeConfigs } from './config';

// ============= Service Locator Implementation =============

class ServiceLocatorImpl implements ServiceLocator {
  private services = new Map<string, unknown>();

  register<T>(name: string, instance: T): void {
    if (this.services.has(name)) {
      console.warn(`[GWEN] Service '${name}' already registered — overwriting.`);
    }
    this.services.set(name, instance);
  }

  get<T>(name: string): T {
    if (!this.services.has(name)) {
      throw new Error(`[GWEN] Service '${name}' not registered. Call register() first.`);
    }
    return this.services.get(name) as T;
  }

  has(name: string): boolean {
    return this.services.has(name);
  }
}

// ============= EngineAPI Implementation =============

class EngineAPIImpl implements EngineAPI {
  readonly services: ServiceLocator;

  constructor(
    private entities: EntityManager,
    private components: ComponentRegistry,
    private queryEngine: QueryEngine,
    private _services: ServiceLocatorImpl,
    private _state: { deltaTime: number; frameCount: number },
  ) {
    this.services = _services;
  }

  get deltaTime(): number { return this._state.deltaTime; }
  get frameCount(): number { return this._state.frameCount; }

  query(componentTypes: ComponentType[]): EntityId[] {
    return this.queryEngine.query(componentTypes, this.entities, this.components);
  }

  createEntity(): EntityId {
    const id = this.entities.create();
    return id;
  }

  destroyEntity(id: EntityId): boolean {
    if (!this.entities.isAlive(id)) return false;
    this.components.removeAll(id);
    const result = this.entities.destroy(id);
    this.queryEngine.invalidate();
    return result;
  }

  addComponent<T>(id: EntityId, type: ComponentType, data: T): void {
    this.components.add(id, type, data);
    this.queryEngine.invalidate();
  }

  getComponent<T>(id: EntityId, type: ComponentType): T | undefined {
    return this.components.get<T>(id, type);
  }

  hasComponent(id: EntityId, type: ComponentType): boolean {
    return this.components.has(id, type);
  }

  removeComponent(id: EntityId, type: ComponentType): boolean {
    const result = this.components.remove(id, type);
    if (result) this.queryEngine.invalidate();
    return result;
  }
}

// ============= Engine =============

export class Engine {
  private config: EngineConfig;
  private isRunning = false;
  private _frameCount = 0;
  private lastFrameTime = 0;
  private _deltaTime = 0;
  private fps = 0;
  private rafHandle = 0;

  // ECS internals
  private entityManager: EntityManager;
  private componentRegistry: ComponentRegistry;
  private queryEngine: QueryEngine;
  private services: ServiceLocatorImpl;
  private api: EngineAPIImpl;

  // Plugin system
  private plugins: TsPlugin[] = [];
  private legacyPlugins: Map<string, unknown> = new Map();

  // Event system
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(userConfig?: Partial<EngineConfig>) {
    this.config = mergeConfigs(defaultConfig, userConfig || {});
    this.validateConfig();

    this.entityManager = new EntityManager(this.config.maxEntities);
    this.componentRegistry = new ComponentRegistry();
    this.queryEngine = new QueryEngine();
    this.services = new ServiceLocatorImpl();

    const state = { deltaTime: 0, frameCount: 0 };
    this.api = new EngineAPIImpl(
      this.entityManager,
      this.componentRegistry,
      this.queryEngine,
      this.services,
      state,
    );

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
   * Calls onInit immediately.
   */
  public registerSystem(plugin: TsPlugin): this {
    if (this.plugins.find(p => p.name === plugin.name)) {
      console.warn(`[GWEN] Plugin '${plugin.name}' already registered.`);
      return this;
    }
    this.plugins.push(plugin);
    plugin.onInit?.(this.api);
    if (this.config.debug) {
      console.log(`[GWEN] Plugin '${plugin.name}' registered`);
    }
    return this;
  }

  /**
   * Legacy plugin loader (backward compat with old `loadPlugin` API).
   */
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

    // Lifecycle: destroy all plugins in reverse order
    for (const plugin of [...this.plugins].reverse()) {
      plugin.onDestroy?.();
    }
    this.emit('stop');
  }

  private tick(now: number): void {
    this._deltaTime = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;
    this._frameCount++;

    if (this._frameCount % 60 === 0) {
      this.fps = this._deltaTime > 0 ? Math.round(1 / this._deltaTime) : 0;
    }

    // Update shared state for API
    (this.api as any)._state.deltaTime = this._deltaTime;
    (this.api as any)._state.frameCount = this._frameCount;

    // ── Game loop order (ENGINE.md §9) ──────────────────────────────────
    // 1. onBeforeUpdate — inputs & intentions
    for (const plugin of this.plugins) {
      plugin.onBeforeUpdate?.(this.api, this._deltaTime);
    }

    // 2. (WASM plugins would run here — physics, AI, etc.)

    // 3. onUpdate — game logic on updated values
    for (const plugin of this.plugins) {
      plugin.onUpdate?.(this.api, this._deltaTime);
    }

    // 4. onRender — drawing
    for (const plugin of this.plugins) {
      plugin.onRender?.(this.api);
    }

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

  /** Expose the EngineAPI (for use by plugins that receive the engine itself) */
  public getAPI(): EngineAPI {
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
