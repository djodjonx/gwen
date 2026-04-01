import type { AutoImport, GwenTypeTemplate } from '@gwenengine/kit';

/**
 * Which WASM binary build variant to load.
 * - `'debug'` — unoptimised, faster to build, includes debug info.
 * - `'release'` — optimised, smaller, suitable for production.
 * - `'auto'` — resolves to `'release'` during `vite build`, `'debug'` during `vite dev`.
 */
export type WasmVariant = 'debug' | 'release' | 'auto';

/**
 * Options for the WASM sub-plugin (`gwen:wasm`).
 */
export interface GwenWasmOptions {
  /**
   * Which WASM binary to load.
   * @default 'auto'
   */
  variant?: WasmVariant;

  /**
   * Override the path to the WASM file.
   * When omitted the plugin resolves the binary from the installed
   * `@gwenengine/core` package.
   */
  wasmPath?: string;

  /**
   * Enable WASM HMR.
   * When `true`, a `.wasm` source file change triggers a full page reload.
   * @default true
   */
  hmr?: boolean;
}

/**
 * Top-level options for the `gwenVitePlugin` / individual sub-plugins.
 */
export interface GwenViteOptions {
  /** WASM binary options. */
  wasm?: GwenWasmOptions;

  /**
   * Auto-import entries to expose via `virtual:gwen/auto-imports`.
   * @default []
   */
  autoImports?: AutoImport[];

  /**
   * Type templates to write into `.gwen/types/` at build start.
   * @default []
   */
  typeTemplates?: GwenTypeTemplate[];

  /**
   * Directory (relative to project root) where generated files are written.
   * @default '.gwen'
   */
  gwenDir?: string;

  /**
   * Whether to generate `.d.ts` files for auto-imports.
   * Set to `false` to opt out.
   * @default true
   */
  dts?: boolean;
}
