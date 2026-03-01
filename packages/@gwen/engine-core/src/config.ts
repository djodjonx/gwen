import type { EngineConfig } from './types';

/**
 * Default engine configuration - Pure logic, no rendering concerns
 * Matches Nuxt-like config pattern with wasm/ts plugin separation
 */
export const defaultConfig: EngineConfig = {
  maxEntities: 5000,
  targetFPS: 60,
  debug: false,
  enableStats: true,
  wasmPlugins: [],
  tsPlugins: [],
};

/**
 * Merge user config with defaults
 * Handles both new (wasm/ts) plugin formats
 */
export function mergeConfigs(defaults: EngineConfig, user: Partial<EngineConfig>): EngineConfig {
  return {
    ...defaults,
    ...user,
    wasmPlugins: [...(defaults.wasmPlugins || []), ...(user.wasmPlugins || [])],
    tsPlugins: [...(defaults.tsPlugins || []), ...(user.tsPlugins || [])],
  };
}

/**
 * Configuration builder for type-safe config
 *
 * Nuxt-like style: explicit wasm vs ts plugin separation
 *
 * @example
 * ```typescript
 * const config = defineConfig({
 *   wasmPlugins: [Physics2D({ gravity: 9.81 })],
 *   tsPlugins: [Input(), Audio()],
 *   engine: { maxEntities: 10000, targetFPS: 60 },
 * });
 * ```
 */
export function defineConfig(config: Partial<EngineConfig>): Partial<EngineConfig> {
  return config;
}

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
  public addWasmPlugin(plugin: any): this {
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
  public addTsPlugin(plugin: any): this {
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


