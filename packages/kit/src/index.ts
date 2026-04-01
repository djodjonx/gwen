/**
 * @gwenengine/kit — GWEN plugin authoring kit.
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
 *   Import them from `@gwenengine/core`.
 * - `defineConfig()`, `createEngine()` — project bootstrap, not authoring.
 *   Import `defineConfig` from `@gwenengine/kit` and `createEngine` from `@gwenengine/core`.
 */

// ── Project config helper ─────────────────────────────────────────────────────

export { defineConfig } from './config';
export type {
  TypedEngineConfig,
  GwenConfig,
  MergePluginsProvides,
  MergePluginsHooks,
  MergePluginsPrefabExtensions,
  MergePluginsSceneExtensions,
  MergePluginsUIExtensions,
} from './config';

// ── Plugin authoring helper ───────────────────────────────────────────────────

export { definePlugin } from './define-plugin';
export type {
  GwenPluginDefinition,
  WasmPluginDefinition,
  WasmPluginStaticContext,
  GwenPluginLifecycle,
  WasmPluginLifecycle,
  PluginClass,
  GwenPluginInstance,
} from './define-plugin';

// ── Type re-exports from @gwenengine/core ────────────────────────────────────
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
} from '@gwenengine/core';

export type { AllocatedChannel, PluginDataBus } from '@gwenengine/core';

// ── Runtime re-exports (values, not types) ────────────────────────────────────

export { loadWasmPlugin } from '@gwenengine/core';
export { isWasmPlugin } from '@gwenengine/core';
export { createEntityId, unpackEntityId } from '@gwenengine/core';
