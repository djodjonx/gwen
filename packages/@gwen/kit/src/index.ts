/**
 * @gwen/kit — GWEN plugin authoring kit.
 *
 * Provides helpers and type re-exports for creating GWEN plugins.
 * Intended for plugin authors — both first-party (official plugins)
 * and third-party (community / ecosystem plugins).
 *
 * ## What belongs here
 * - `definePlugin()` — factory for TS-only and WASM plugins
 * - Type re-exports needed to author a plugin (no game-loop primitives)
 *
 * ## What does NOT belong here
 * - `defineSystem()`, `defineScene()`, `defineUI()`, `definePrefab()` —
 *   these are game development primitives, not plugin authoring tools.
 *   Import them from `@gwen/engine-core`.
 * - `defineConfig()`, `createEngine()` — project bootstrap, not authoring.
 *   Import from `@gwen/engine-core`.
 *
 * @example TS-only plugin
 * ```ts
 * import { definePlugin } from '@gwen/kit';
 *
 * export const MyPlugin = definePlugin({
 *   name: 'MyPlugin',
 *   provides: { myService: {} as MyService },
 *   setup(opts: MyOptions = {}) {
 *     return {
 *       onInit(api) { api.services.register('myService', new MyService(opts)); },
 *     };
 *   },
 * });
 * ```
 *
 * @example WASM plugin
 * ```ts
 * import { definePlugin, loadWasmPlugin } from '@gwen/kit';
 *
 * export const Physics2DPlugin = definePlugin({
 *   name: 'Physics2D',
 *   provides: { physics: {} as Physics2DAPI },
 *   wasm: { id: 'physics2d', channels: [...] },
 *   setup(opts: Physics2DConfig = {}) {
 *     let wasm: WasmPhysics2D | null = null;
 *     return {
 *       async onWasmInit(_bridge, _region, api, bus) {
 *         const mod = await loadWasmPlugin({ jsUrl: '/wasm/gwen_physics2d.js' });
 *         wasm = new mod.Physics2DPlugin(opts.gravity ?? -9.81);
 *         api.services.register('physics', buildAPI(wasm));
 *       },
 *       onStep(dt) { wasm?.step(dt); },
 *       onDestroy() { wasm?.free(); },
 *     };
 *   },
 * });
 * ```
 */

// ── Plugin authoring helper ───────────────────────────────────────────────────

export { definePlugin } from './define-plugin';
export type {
  TsPluginDefinition,
  WasmPluginDefinition,
  WasmPluginStaticContext,
  TsPluginLifecycle,
  WasmPluginLifecycle,
  PluginClass,
  GwenPluginInstance,
} from './define-plugin';

// ── Type re-exports from @gwen/engine-core ────────────────────────────────────
// Only types necessary to *author* a plugin are re-exported here.
// Game-loop primitives (defineSystem, defineScene, etc.) are intentionally omitted.

export type {
  // Plugin interfaces
  GwenPlugin,
  GwenPluginWasmContext,
  PluginEntry,
  GwenPluginMeta,

  // Engine API — received in every lifecycle callback
  EngineAPI,

  // WASM plugin infrastructure
  PluginChannel,
  DataChannel,
  EventChannel,
  GwenEvent,
  WasmBridge,
  MemoryRegion,
  WasmPluginLoadOptions,

  // Entity / component primitives needed in plugin implementations
  EntityId,
  ComponentType,

  // Hooks
  GwenHooks,
  GwenHookable,
} from '@gwen/engine-core';

export type { AllocatedChannel, PluginDataBus } from '@gwen/engine-core';

// ── Runtime re-exports (values, not types) ────────────────────────────────────

export { loadWasmPlugin } from '@gwen/engine-core';
export { isWasmPlugin } from '@gwen/engine-core';
