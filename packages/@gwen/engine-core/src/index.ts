// GWEN Engine Core — Public API

// Types (source of truth for shared types)
export * from './types';
export * from './schema';

// Config — defineConfig() generic + TypedEngineConfig
export { defaultConfig, mergeConfigs, defineConfig, createEngine, ConfigBuilder } from './config';
export type { TypedEngineConfig, GwenConfigServices } from './config';

// Typed plugin system — GwenPlugin<N, P> + createPlugin()
export { createPlugin } from './plugin-system/plugin';
export type {
  GwenPlugin,
  AnyGwenPlugin,
  GwenPluginDef,
  GwenPluginMeta,
  PluginProvides,
  MergeProvides,
  UnionToIntersection,
} from './plugin-system/plugin';

// ECS internals (kept for tests / advanced usage)
export { EntityManager, ComponentRegistry, QueryEngine } from './core/ecs';

// Engine
export { Engine, getEngine, useEngine, resetEngine } from './engine';

// API & ServiceLocator
export { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api';
export type { EngineState } from './api';

// Plugin manager
export { PluginManager } from './plugin-system/plugin-manager';

// Scene system
export { SceneManager, defineScene } from './scene';
export type { Scene, SceneBody } from './scene';

// UI system
export { UIManager, defineUI, UIComponent } from './ui';
export type { UIDefinition } from './ui';

// Prefab system
export { definePrefab, PrefabManager } from './core/prefab';
export type { PrefabDefinition } from './core/prefab';

// WASM Bridge
export { initWasm, getWasmBridge, _resetWasmBridge, _injectMockWasmEngine } from './wasm-bridge';
export type { WasmBridge, WasmEntityId, WasmEngine, GwenCoreWasm } from './wasm-bridge';
