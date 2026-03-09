/**
 * @djodjonx/gwen-kit — GWEN plugin authoring kit.
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
 *   Import them from `@djodjonx/gwen-engine-core`.
 * - `defineConfig()`, `createEngine()` — project bootstrap, not authoring.
 *   Import `defineConfig` from `@djodjonx/gwen-kit` and `createEngine` from `@djodjonx/gwen-engine-core`.
 */

// ── Project config helper ─────────────────────────────────────────────────────

export { defineConfig } from './config';
export type { TypedEngineConfig, MergePluginsProvides, MergePluginsHooks } from './config';

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

// ── Type re-exports from @djodjonx/gwen-engine-core ────────────────────────────────────
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
} from '@djodjonx/gwen-engine-core';

export type { AllocatedChannel, PluginDataBus } from '@djodjonx/gwen-engine-core';

// ── Runtime re-exports (values, not types) ────────────────────────────────────

export { loadWasmPlugin } from '@djodjonx/gwen-engine-core';
export { isWasmPlugin } from '@djodjonx/gwen-engine-core';
export { createEntityId, unpackEntityId } from '@djodjonx/gwen-engine-core';
