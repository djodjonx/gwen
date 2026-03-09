/**
 * @file Legacy WASM plugin type alias — kept for backward compatibility.
 *
 * @deprecated Import `GwenPlugin` with a `wasm` sub-object from
 * `@djodjonx/gwen-engine-core` instead.
 *
 * The `GwenWasmPlugin` interface has been merged into the unified `GwenPlugin`
 * type. Declare the WASM runtime context via the `readonly wasm` field:
 *
 * ```ts
 * // Before
 * class MyPlugin implements GwenWasmPlugin { ... }
 *
 * // After
 * class MyPlugin implements GwenPlugin<'MyPlugin', MyServices> {
 *   readonly wasm: GwenPluginWasmContext = { id: 'my-plugin', onInit: async (...) => { ... } };
 * }
 * ```
 */

// GwenPluginWasmContext is already exported via types/plugin.ts — re-exporting
// only the deprecated alias to avoid duplicate-export ambiguity in the barrel.
export type {
  /** @deprecated Use `GwenPlugin` with `readonly wasm: GwenPluginWasmContext` instead. */
  LegacyWasmPlugin as GwenWasmPlugin,
} from './plugin';
