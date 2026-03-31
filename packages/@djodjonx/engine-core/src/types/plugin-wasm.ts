/**
 * @file WASM plugin alias helpers.
 *
 * `GwenWasmPlugin` is a convenience alias for plugins that always include
 * a `wasm` runtime context.
 *
 * Implementation guidance:
 *
 * ```ts
 * class MyPlugin implements GwenPlugin<'MyPlugin', MyServices> {
 *   readonly wasm: GwenPluginWasmContext = { id: 'my-plugin', onInit: async (...) => { ... } };
 * }
 * ```
 */

export type { GwenWasmPlugin } from './plugin';
