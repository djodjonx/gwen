// GWEN Engine Core — Public API

// Types (source of truth for shared types)
export * from './types';
export * from './schema';

// Hooks system
export { createGwenHooks } from './hooks';
export type { GwenHooks, GwenHookable } from './hooks';

// Config — defineConfig() generic + TypedEngineConfig
export { defaultConfig, mergeConfigs, defineConfig, createEngine } from './config/config';
export { ConfigBuilder } from './config/config-builder';
export type { TypedEngineConfig, GwenConfigServices, GwenConfigHooks } from './config/config';

// Typed plugin system — GwenPlugin interface
export type {
  GwenPlugin,
  GwenPluginMeta,
  PluginProvides,
  PluginProvidesHooks,
  WasmPluginProvides,
  MergeProvides,
  MergeHooks,
  MergeWasmProvides,
  MergeAllProvides,
  MergeAllHooks,
  UnionToIntersection,
} from './plugin-system/plugin';

// System definition — defineSystem() for game logic
export { defineSystem } from './plugin-system/system';
export type { System, SystemBody, SystemFactory } from './plugin-system/system';

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
export type { WasmBridge, WasmEntityId, WasmEngine, GwenCoreWasm } from './engine/wasm-bridge';

// WASM Plugin Infrastructure
export {
  SharedMemoryManager,
  TRANSFORM_STRIDE,
  FLAG_PHYSICS_ACTIVE,
  FLAGS_OFFSET,
  SENTINEL,
} from './wasm/shared-memory';
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
