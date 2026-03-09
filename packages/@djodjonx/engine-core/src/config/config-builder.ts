/**
 * ConfigBuilder — fluent API for programmatic engine configuration.
 *
 * Useful when configuration values are determined at runtime or in
 * advanced bootstrapping scenarios. For static project configuration,
 * prefer `defineConfig()` in `gwen.config.ts`.
 *
 * @example
 * ```typescript
 * const config = new ConfigBuilder()
 *   .setMaxEntities(10_000)
 *   .setTargetFPS(60)
 *   .addPlugin(physics2D({ gravity: -9.81 }))
 *   .addPlugin(new InputPlugin())
 *   .enableDebug()
 *   .build();
 * ```
 */

import type { EngineConfig, GwenPlugin } from '../types';
import { defaultConfig, mergeConfigs } from './config';

export class ConfigBuilder {
  private config: Partial<EngineConfig> = {
    maxEntities: defaultConfig.maxEntities,
    targetFPS: defaultConfig.targetFPS,
    debug: defaultConfig.debug,
    enableStats: defaultConfig.enableStats,
    plugins: [],
  };

  /**
   * Set the maximum number of simultaneously alive entities.
   * The engine enforces a minimum of `100`.
   *
   * @param count - Maximum entity count.
   */
  public setMaxEntities(count: number): this {
    this.config.maxEntities = count;
    return this;
  }

  /**
   * Set the target frames per second for the game loop.
   * Accepted range: `[1, 300]`.
   *
   * @param fps - Target FPS.
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
   * Add a plugin to the unified `plugins` array.
   *
   * Both TS-only plugins and WASM plugins (those with a `wasm` sub-object)
   * can be added via this method — `createEngine()` detects the kind
   * automatically.
   *
   * @param plugin - Any `GwenPlugin` instance.
   */
  public addPlugin(plugin: GwenPlugin): this {
    if (!this.config.plugins) this.config.plugins = [];
    this.config.plugins.push(plugin);
    return this;
  }

  /**
   * @deprecated Use `addPlugin()` instead.
   *
   * Add a WASM plugin. Kept for backward compatibility — the plugin is pushed
   * into the legacy `wasmPlugins` array which `createEngine()` still reads.
   *
   * @param plugin - A plugin with a `wasm` sub-object.
   */
  public addWasmPlugin(plugin: GwenPlugin): this {
    if (!this.config.wasmPlugins) this.config.wasmPlugins = [];
    this.config.wasmPlugins.push(plugin);
    return this;
  }

  /**
   * @deprecated Use `addPlugin()` instead.
   *
   * Add a TypeScript plugin. Kept for backward compatibility — the plugin is
   * pushed into the legacy `tsPlugins` array which `createEngine()` still reads.
   *
   * @param plugin - A TS-only plugin.
   */
  public addTsPlugin(plugin: GwenPlugin): this {
    if (!this.config.tsPlugins) this.config.tsPlugins = [];
    this.config.tsPlugins.push(plugin);
    return this;
  }

  /**
   * Merge all builder options into a final `EngineConfig` object.
   * Unset options fall back to `defaultConfig`.
   *
   * @returns A complete `EngineConfig` ready to pass to `createEngine()`.
   */
  public build(): EngineConfig {
    return mergeConfigs(defaultConfig, this.config);
  }
}
