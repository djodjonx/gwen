import { gwenWasmPlugin } from './wasm.js';
import { gwenAutoImportsPlugin } from './auto-imports.js';
import { gwenTypesPlugin } from './types-writer.js';
import { gwenVirtualPlugin } from './virtual-env.js';
import type { GwenViteOptions } from '../types.js';
import type { PluginOption } from 'vite';

export { gwenWasmPlugin } from './wasm.js';
export { gwenAutoImportsPlugin, generateAutoImportsModule } from './auto-imports.js';
export { gwenTypesPlugin } from './types-writer.js';
export { gwenVirtualPlugin } from './virtual-env.js';

/**
 * Composite Vite plugin that wires together all GWEN sub-plugins:
 *
 * - `gwen:wasm` — serves / inlines the WASM binary
 * - `gwen:auto-imports` — virtual module for composable re-exports
 * - `gwen:types` — writes type-template `.d.ts` files
 * - `gwen:virtual` — injects `virtual:gwen/env` constants
 *
 * @param options - Plugin configuration. All sub-options are optional.
 *
 * @example vite.config.ts
 * ```ts
 * import { defineConfig } from 'vite'
 * import { gwenVitePlugin } from '@gwenjs/vite'
 *
 * export default defineConfig({
 *   plugins: [gwenVitePlugin()],
 * })
 * ```
 */
export function gwenVitePlugin(options: GwenViteOptions = {}): PluginOption {
  return [
    gwenWasmPlugin(options),
    gwenAutoImportsPlugin(options),
    gwenTypesPlugin(options),
    gwenVirtualPlugin(options),
  ];
}
