import type { EngineConfig } from './types';

/**
 * Default engine configuration
 */
export const defaultConfig: EngineConfig = {
  maxEntities: 5000,
  canvas: 'game-canvas',
  width: 1280,
  height: 720,
  targetFPS: 60,
  debug: false,
  enableStats: true,
  plugins: [],
};

/**
 * Merge user config with defaults
 */
export function mergeConfigs(defaults: EngineConfig, user: Partial<EngineConfig>): EngineConfig {
  return {
    ...defaults,
    ...user,
    plugins: [...(defaults.plugins || []), ...(user.plugins || [])],
  };
}

/**
 * Configuration builder for type-safe config
 *
 * @example
 * ```typescript
 * const config = defineConfig({
 *   canvas: 'my-game',
 *   width: 1920,
 *   height: 1080,
 *   maxEntities: 10000,
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
 *   .setCanvas('game')
 *   .setResolution(1920, 1080)
 *   .setMaxEntities(10000)
 *   .setTargetFPS(60)
 *   .enableDebug()
 *   .build();
 * ```
 */
export class ConfigBuilder {
  private config: Partial<EngineConfig> = { ...defaultConfig };

  public setCanvas(canvasId: string): this {
    this.config.canvas = canvasId;
    return this;
  }

  public setResolution(width: number, height: number): this {
    this.config.width = width;
    this.config.height = height;
    return this;
  }

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

  public addPlugin(plugin: any): this {
    if (!this.config.plugins) {
      this.config.plugins = [];
    }
    this.config.plugins.push(plugin);
    return this;
  }

  public build(): EngineConfig {
    return mergeConfigs(defaultConfig, this.config);
  }
}

interface GwenConfig {
  /** WASM plugins (pre-compiled) */
  wasm?: string[];

  /** TypeScript plugins (bundled) */
  ts?: string[];

  /** Engine configuration */
  engine?: {
    outDir?: string;
    minify?: boolean;
    sourceMap?: boolean;
  };
}

/**
 * Define configuration
 */
export function defineConfig(config: GwenConfig): GwenConfig {
  return config;
}

