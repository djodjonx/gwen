import type { EngineConfig, WasmPlugin, TsPlugin } from './types';
import type { AnyGwenPlugin, MergeProvides } from './plugin';

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
 * Résultat typé de defineConfig() — expose le ServiceMap inféré des plugins.
 *
 * `Services` est l'intersection des `provides` de tous les plugins déclarés.
 */
export interface TypedEngineConfig<Services extends Record<string, unknown>> {
  readonly _services: Services; // type fantôme — jamais lu à runtime
  readonly maxEntities?: number;
  readonly targetFPS?: number;
  readonly debug?: boolean;
  readonly enableStats?: boolean;
  readonly plugins?: TsPlugin[];
  readonly wasmPlugins?: WasmPlugin[];
}

/**
 * Définit la configuration d'un projet GWEN avec inférence complète des services.
 *
 * Les services exposés par chaque plugin sont automatiquement fusionnés dans
 * `TypedEngineConfig<Services>`, ce qui permet à `api.services.get()` d'être
 * fortement typé partout dans le projet.
 *
 * ```typescript
 * // gwen.config.ts
 * export default defineConfig({
 *   plugins: [new InputPlugin(), new AudioPlugin()],
 *   wasmPlugins: [Physics2D({ gravity: 9.81 })],
 *   maxEntities: 10_000,
 *   targetFPS: 60,
 * });
 *
 * // Dans un système / plugin
 * onInit(api: EngineAPI<GwenServices>) {
 *   const kb = api.services.get('keyboard'); // → KeyboardInput ✅
 *   const au = api.services.get('audio');    // → AudioManager  ✅
 * }
 * ```
 *
 * @param config Configuration du projet. `plugins` accepte tout plugin
 *   implémentant `GwenPlugin` (avec `provides`) ou `TsPlugin` (sans typage).
 */
export function defineConfig<
  const Plugins extends readonly AnyGwenPlugin[],
>(config: {
  plugins?: [...Plugins];
  wasmPlugins?: WasmPlugin[];
  maxEntities?: number;
  targetFPS?: number;
  debug?: boolean;
  enableStats?: boolean;
}): TypedEngineConfig<MergeProvides<Plugins>> {
  return config as any;
}

/**
 * Extrait le type `Services` d'une `TypedEngineConfig`.
 *
 * ```typescript
 * const config = defineConfig({ plugins: [new InputPlugin()] });
 * export type GwenServices = GwenConfigServices<typeof config>;
 * // → { keyboard: KeyboardInput; mouse: MouseInput; ... }
 * ```
 */
export type GwenConfigServices<C> =
  C extends TypedEngineConfig<infer S> ? S : Record<string, unknown>;

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

