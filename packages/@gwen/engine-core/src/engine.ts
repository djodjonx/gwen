import type { EngineConfig } from './types';
import { defaultConfig, mergeConfigs } from './config';

/**
 * Main GWEN Engine class
 *
 * The Engine orchestrates all systems and provides the main API
 * for developers building games with GWEN.
 *
 * @example
 * ```typescript
 * import { Engine } from '@gwen/engine-core';
 *
 * const engine = new Engine({
 *   maxEntities: 5000,
 *   canvas: 'game-canvas',
 *   width: 1280,
 *   height: 720,
 * });
 *
 * engine.on('ready', () => {
 *   const player = engine.createEntity();
 *   engine.addComponent(player, 'transform', { x: 100, y: 100 });
 * });
 *
 * engine.start();
 * ```
 */
export class Engine {
  private config: EngineConfig;
  private isRunning = false;
  private frameCount = 0;
  private lastFrameTime = 0;
  private deltaTime = 0;
  private fps = 0;
  private plugins: Map<string, any> = new Map();
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(userConfig?: Partial<EngineConfig>) {
    this.config = mergeConfigs(defaultConfig, userConfig || {});
    this.validateConfig();
    this.initializeSystems();
  }

  private validateConfig(): void {
    if (this.config.maxEntities < 100) {
      throw new Error('maxEntities must be at least 100');
    }
  }

  private initializeSystems(): void {
    console.log('[GWEN] Engine initialized');
  }

  /**
   * Start the engine and game loop
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.emit('start');

    const gameLoop = (currentTime: number) => {
      this.update(currentTime);
      if (this.isRunning) requestAnimationFrame(gameLoop);
    };

    requestAnimationFrame(gameLoop);
  }

  /**
   * Stop the engine
   */
  public stop(): void {
    this.isRunning = false;
    this.emit('stop');
  }

  private update(currentTime: number): void {
    this.deltaTime = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;
    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      this.fps = Math.round(1 / this.deltaTime);
    }
    this.deltaTime = Math.min(this.deltaTime, 0.1);
    this.emit('update', { deltaTime: this.deltaTime, frameCount: this.frameCount });
  }

  // ============= Entity Management =============

  public createEntity(): number {
    return Math.floor(Math.random() * 1000000);
  }

  public destroyEntity(entityId: number): boolean {
    return true;
  }

  public entityExists(entityId: number): boolean {
    return true;
  }

  public getEntityCount(): number {
    return 0;
  }

  // ============= Component Management =============

  public addComponent(entityId: number, componentType: string, data: any): void {
    // Implementation
  }

  public removeComponent(entityId: number, componentType: string): void {
    // Implementation
  }

  public getComponent(entityId: number, componentType: string): any {
    return null;
  }

  public hasComponent(entityId: number, componentType: string): boolean {
    return false;
  }

  // ============= Query System =============

  public query(componentTypes: string[]): number[] {
    return [];
  }

  public queryWith(componentTypes: string[], filter?: (entityId: number) => boolean): number[] {
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
    const listeners = this.eventListeners.get(eventType);
    if (listeners) listeners.delete(listener);
  }

  private emit(eventType: string, data?: any): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[GWEN] Error in ${eventType} listener:`, error);
        }
      });
    }
  }

  // ============= Plugin System =============

  public loadPlugin(name: string, plugin: any): void {
    if (this.plugins.has(name)) return;
    try {
      if (typeof plugin.init === 'function') {
        plugin.init(this);
      }
      this.plugins.set(name, plugin);
      console.log(`[GWEN] Plugin '${name}' loaded`);
    } catch (error) {
      console.error(`[GWEN] Failed to load plugin '${name}':`, error);
    }
  }

  public getPlugin(name: string): any {
    return this.plugins.get(name);
  }

  public hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  // ============= Stats & Debug =============

  public getFPS(): number {
    return this.fps;
  }

  public getDeltaTime(): number {
    return this.deltaTime;
  }

  public getFrameCount(): number {
    return this.frameCount;
  }

  public getConfig(): EngineConfig {
    return { ...this.config };
  }

  public getStats() {
    return {
      fps: this.fps,
      frameCount: this.frameCount,
      deltaTime: this.deltaTime,
      entityCount: this.getEntityCount(),
      isRunning: this.isRunning,
    };
  }
}

/**
 * Global engine instance
 */
let globalEngine: Engine | null = null;

/**
 * Get or create global engine instance
 */
export function getEngine(config?: Partial<EngineConfig>): Engine {
  if (!globalEngine) {
    globalEngine = new Engine(config);
  }
  return globalEngine;
}

/**
 * Get the global engine instance
 */
export function useEngine(): Engine {
  if (!globalEngine) {
    throw new Error('[GWEN] Engine not initialized. Call getEngine() first.');
  }
  return globalEngine;
}

/**
 * Reset global engine (useful for testing)
 */
export function resetEngine(): void {
  globalEngine = null;
}

