/**
 * ConfigBuilder — Advanced fluent API for engine configuration
 *
 * Provides a builder pattern for programmatic configuration with chaining.
 * Useful when configuration is determined at runtime or in advanced scenarios.
 */

import type { EngineConfig, GwenWasmPlugin, TsPlugin } from '../types';
import { defaultConfig, mergeConfigs } from './config';

/**
 * Advanced builder with chaining
 *
 * @example
 * ```typescript
 * const config = new ConfigBuilder()
 *   .setMaxEntities(10000)
 *   .setTargetFPS(60)
 *   .addWasmPlugin(Physics2D({ gravity: 9.81 }))
 *   .addTsPlugin(Input())
 *   .addTsPlugin(Audio())
 *   .enableDebug()
 *   .build();
 *
 * const engine = new Engine(config);
 * ```
 */
export class ConfigBuilder {
  private config: Partial<EngineConfig> = {
    maxEntities: defaultConfig.maxEntities,
    targetFPS: defaultConfig.targetFPS,
    debug: defaultConfig.debug,
    enableStats: defaultConfig.enableStats,
    wasmPlugins: [],
    tsPlugins: [],
  };

  /**
   * Set the maximum number of simultaneously alive entities.
   * Minimum value accepted by the engine is `100`.
   *
   * @param count Maximum entity count.
   */
  public setMaxEntities(count: number): this {
    this.config.maxEntities = count;
    return this;
  }

  /**
   * Set the target frames per second for the game loop.
   * Accepted range: [1, 300].
   *
   * @param fps Target FPS.
   */
  public setTargetFPS(fps: number): this {
    this.config.targetFPS = fps;
    return this;
  }

  /** Enable verbose debug logging and sentinel integrity checks each frame. */
  public enableDebug(): this {
    this.config.debug = true;
    return this;
  }

  /** Disable debug logging. */
  public disableDebug(): this {
    this.config.debug = false;
    return this;
  }

  /** Enable per-frame performance statistics collection. */
  public enableStats(): this {
    this.config.enableStats = true;
    return this;
  }

  /** Disable performance statistics collection. */
  public disableStats(): this {
    this.config.enableStats = false;
    return this;
  }

  /**
   * Add a WASM plugin (Rust-compiled, performance-critical).
   *
   * Examples: `Physics2D`, `NetworkingEngine`, custom AI simulation.
   *
   * @param plugin A `GwenWasmPlugin` implementation.
   */
  public addWasmPlugin(plugin: GwenWasmPlugin): this {
    if (!this.config.wasmPlugins) {
      this.config.wasmPlugins = [];
    }
    this.config.wasmPlugins.push(plugin);
    return this;
  }

  /**
   * Add a TypeScript plugin (bundled with the game, accesses web APIs).
   *
   * Examples: `InputPlugin`, `AudioPlugin`, `Canvas2DRenderer`.
   *
   * @param plugin A `TsPlugin` implementation.
   */
  public addTsPlugin(plugin: TsPlugin): this {
    if (!this.config.tsPlugins) {
      this.config.tsPlugins = [];
    }
    this.config.tsPlugins.push(plugin);
    return this;
  }

  /**
   * Merge all builder options into a final `EngineConfig` object.
   * Unset options fall back to `defaultConfig`.
   *
   * @returns A complete `EngineConfig` ready to pass to `new Engine()`.
   */
  public build(): EngineConfig {
    return mergeConfigs(defaultConfig, this.config);
  }
}
