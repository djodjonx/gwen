/**
 * GWEN configuration types
 */

export interface GwenConfig {
  /** WASM plugins (pre-compiled) */
  wasm?: string[];

  /** TypeScript plugins (bundled) */
  ts?: string[];

  /** Engine configuration */
  engine?: {
    maxEntities?: number;
    targetFPS?: number;
    debug?: boolean;
  };

  /** Build configuration */
  build?: {
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

