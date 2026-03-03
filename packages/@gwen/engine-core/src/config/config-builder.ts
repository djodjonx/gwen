/**
 * ConfigBuilder — Advanced fluent API for engine configuration
 *
 * Provides a builder pattern for programmatic configuration with chaining.
 * Useful when configuration is determined at runtime or in advanced scenarios.
 */

import type { EngineConfig, WasmPlugin, TsPlugin } from '../types';
import { defaultConfig, mergeConfigs } from '../config';

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

  public setMaxEntities(count: number): this {
    this.config.maxEntities = count;
    return this;
  }

  public setTargetFPS(fps: number): this {
    this.config.targetFPS = fps;
    return this;
  }

  public enableDebug(): this {
    this.config.debug = true;
    return this;
  }

  public disableDebug(): this {
    this.config.debug = false;
    return this;
  }

  public enableStats(): this {
    this.config.enableStats = true;
    return this;
  }

  public disableStats(): this {
    this.config.enableStats = false;
    return this;
  }

  /**
   * Add WASM plugin (Rust-compiled, performance-critical)
   * Examples: Physics2D, NetworkingEngine, CustomAI
   */
  public addWasmPlugin(plugin: WasmPlugin): this {
    if (!this.config.wasmPlugins) {
      this.config.wasmPlugins = [];
    }
    this.config.wasmPlugins.push(plugin);
    return this;
  }

  /**
   * Add TypeScript plugin (bundled with game, web APIs)
   * Examples: Input, Audio, AssetManager, UI
   */
  public addTsPlugin(plugin: TsPlugin): this {
    if (!this.config.tsPlugins) {
      this.config.tsPlugins = [];
    }
    this.config.tsPlugins.push(plugin);
    return this;
  }

  /**
   * Build final configuration
   */
  public build(): EngineConfig {
    return mergeConfigs(defaultConfig, this.config);
  }
}

