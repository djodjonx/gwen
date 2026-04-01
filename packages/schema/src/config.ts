/**
 * GWEN Configuration Schema - Types
 *
 * Core types for the GWEN engine configuration.
 * These types form the Single Source of Truth (SSOT) for all config handling.
 *
 * @module @gwenengine/schema
 */

/**
 * Type reference metadata for plugin services and hooks.
 *
 * @example
 * ```ts
 * const ref: GwenTypeRefMeta = {
 *   from: '@my/plugin',
 *   exportName: 'MyServiceAPI'
 * };
 * ```
 */
export interface GwenTypeRefMeta {
  /** Module path where the type is exported from */
  from: string;
  /** Export name of the type in that module */
  exportName: string;
}

/**
 * Plugin metadata for type inference and documentation.
 *
 * Contains information about services and hooks provided by a plugin,
 * enabling the CLI to generate accurate type definitions.
 */
export interface GwenPluginMeta {
  /** Type references for this plugin (future extension) */
  typeReferences?: string[];
  /** Service types provided by this plugin, keyed by service name */
  serviceTypes?: Record<string, GwenTypeRefMeta>;
  /** Hook types provided by this plugin, keyed by hook name */
  hookTypes?: Record<string, GwenTypeRefMeta>;
}

/**
 * Base interface for GWEN plugins.
 *
 * Minimal structure required for all plugins.
 * Plugins can extend this with additional properties as needed.
 */
export interface GwenPluginBase {
  /** Unique plugin name used for identification and debugging */
  name: string;
  /** Optional plugin metadata for type inference */
  meta?: GwenPluginMeta;
  /** Services provided by this plugin to the engine */
  provides?: Record<string, unknown>;
  /** Hooks provided by this plugin to the engine */
  providesHooks?: Record<string, (...args: any[]) => any>;
  /** Optional WASM context (present if plugin is WASM-based) */
  wasm?: unknown;
}

/**
 * Core engine configuration options (normalized form).
 *
 * This is the fully resolved and validated configuration used internally
 * by the engine and CLI. All optional fields have been filled with defaults.
 */
export interface GwenOptions {
  /** Engine-specific configuration */
  engine: {
    /** Maximum number of entities the engine can manage */
    maxEntities: number;
    /** Target frames per second */
    targetFPS: number;
    /** Enable debug mode */
    debug: boolean;
    /** Enable performance statistics collection */
    enableStats: boolean;
    /** Use sparse transform synchronization */
    sparseTransformSync: boolean;
    /** Loop ownership mode */
    loop: 'internal' | 'external';
    /** Delta cap in seconds for a single simulation step */
    maxDeltaSeconds: number;
  };
  /** HTML generation settings for the dev server */
  html: {
    /** Page title */
    title: string;
    /** Background color as hex value */
    background: string;
  };
  /** Array of plugins (TS and WASM mixed) */
  plugins: GwenPluginBase[];
  /** List of scene names available in the project */
  scenes: string[];
  /** Scene loading mode: 'auto' to auto-load scene files, false to disable */
  scenesMode: 'auto' | false;
  /** Initial scene to load at startup (optional) */
  mainScene?: string;
  /** Project root directory (set by resolver at runtime) */
  rootDir?: string;
  /** Source directory for the project */
  srcDir: string;
  /** Output directory for builds */
  outDir: string;
  /** Development mode flag (set by CLI/build system) */
  dev?: boolean;
}

/**
 * User-provided configuration input (partial and legacy-compatible).
 *
 * Accepts partial configurations, legacy plugin arrays, and preserves
 * backward compatibility with older `tsPlugins`/`wasmPlugins` format.
 */
export interface GwenConfigInput extends DeepPartial<GwenOptions> {}

/**
 * Deep partial version of a type - all properties are recursively optional.
 *
 * @internal Used for type-safe partial config objects
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Minimal Engine API contract for schema/prepare tooling.
 *
 * Important:
 * - This is intentionally lightweight and focused on service/hook typing.
 * - It is used by CLI/type-generation flows (`gwen prepare`).
 * - Runtime plugins should rely on the full `EngineAPI` exposed by
 *   `@gwenengine/core`.
 *
 * @internal
 */
export interface EngineAPI<
  Services extends object = Record<string, unknown>,
  Hooks extends object = Record<string, (...args: any[]) => any>,
> {
  services: {
    /** Typed access to known services. */
    get<K extends keyof Services & string>(name: K): Services[K];
    /** Fallback accessor for dynamic keys. */
    get<T = unknown>(name: string): T;
  };
  hooks: {
    /** Typed hook subscription for known hook names. */
    hook<K extends keyof Hooks & string>(
      name: K,
      callback: Hooks[K] extends (...args: infer A) => unknown ? (...args: A) => unknown : never,
    ): void;
    /** Fallback hook subscription for dynamic hook names. */
    hook(name: string, callback: (...args: unknown[]) => unknown): void;
  };
}
