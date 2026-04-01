// GWEN Engine Core — Public API

// Types (source of truth for shared types)
export * from './types';
export * from './schema';

// Hooks system
export { createGwenHooks } from './hooks';
export type { GwenHooks, GwenHookable } from './hooks';

// Config runtime helpers
export { defaultConfig, mergeConfigs, createEngine } from './config/config';
export { ConfigBuilder } from './config/config-builder';
export type { GwenConfigServices, GwenConfigHooks } from './config/config';

// Unified plugin system — GwenPlugin, GwenPluginWasmContext, isWasmPlugin
// isWasmPlugin is a runtime function living in plugin-system/plugin-utils.ts
// so Vite does not tree-shake it when bundling.
export { isWasmPlugin } from './plugin-system/plugin-utils';
export type { GwenPlugin, GwenPluginWasmContext, PluginEntry } from './types/plugin';

// Plugin system utilities — type helpers for defineConfig() inference
export type {
  GwenPluginMeta,
  // Primary
  MergePluginsProvides,
  MergePluginsHooks,
  PluginProvides,
  PluginProvidesHooks,
  UnionToIntersection,
} from './plugin-system/plugin';

// System definition — defineSystem() for game logic
export { defineSystem } from './plugin-system/system';
export type {
  System,
  SystemBody,
  SystemFactory,
  SystemQuery,
  SystemQueryDescriptor,
  QueryResult,
  EntityAccessor,
} from './plugin-system/system';

// Query result builder (for advanced use)
export { buildQueryResult, resolveSystemQueryIds } from './core/query-result';

// ECS internals (kept for tests / advanced usage)
export { EntityManager, ComponentRegistry, QueryEngine } from './core/ecs';

// Engine
export { Engine } from './engine/engine';
export { getEngine, useEngine, resetEngine } from './engine/engine-globals';
export type { EntityId } from './engine/engine-api';

// API & ServiceLocator
export { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api/api';
export type { EngineState } from './api/api';

// Plugin manager
export { PluginManager } from './plugin-system/plugin-manager';

// Scene system
export { SceneManager, defineScene } from './api/scene';
export type { Scene, SceneBody } from './api/scene';
export type { ReloadContext, ReloadEvaluator } from './api/scene-context';

// UI system
export { UIManager, defineUI, UIComponent } from './api/ui';
export type { UIDefinition } from './api/ui';

// Prefab system
export { definePrefab, PrefabManager } from './core/prefab';
export type { PrefabDefinition } from './core/prefab';

// WASM Bridge
export {
  initWasm,
  getWasmBridge,
  _resetWasmBridge,
  _injectMockWasmEngine,
} from './engine/wasm-bridge';
export type {
  WasmBridge,
  WasmEntityId,
  WasmEngine,
  GwenCoreWasm,
  CoreVariant,
  InitWasmOptions,
} from './engine/wasm-bridge';

// WASM Plugin Infrastructure
export {
  SharedMemoryManager,
  TRANSFORM_STRIDE,
  TRANSFORM3D_STRIDE,
  FLAG_PHYSICS_ACTIVE,
  FLAGS_OFFSET,
  FLAGS3D_OFFSET,
  SENTINEL,
} from './wasm/shared-memory';

// 3D Transform component + low-level buffer accessors
export {
  TRANSFORM_OFFSETS,
  Transform3D,
  readTransform3DPosition,
  readTransform3DRotation,
  readTransform3DScale,
  writeTransform3DPosition,
  writeTransform3DRotation,
  writeTransform3DScale,
} from './components/transform3d';
export type { MemoryRegion } from './wasm/shared-memory';
export { loadWasmPlugin } from './wasm/wasm-plugin-loader';
export type { WasmPluginLoadOptions } from './wasm/wasm-plugin-loader';

// Plugin Data Bus — channel-based WASM ↔ TS communication
export {
  PluginDataBus,
  readEventChannel,
  writeEventToChannel,
  getDataChannelView,
} from './wasm/plugin-data-bus';
export type { AllocatedChannel } from './wasm/plugin-data-bus';

// String Pool — memory-efficient string storage for ECS
export { GlobalStringPoolManager, StringPoolManager, StringPool } from './utils/string-pool';

// Core variant detection
export { detectCoreVariant } from './utils/variant-detector';
export { detectSharedMemoryRequired } from './utils/variant-detector';
