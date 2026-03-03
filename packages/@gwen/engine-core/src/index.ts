// GWEN Engine Core — Public API

// Types (source of truth for shared types)
export * from './types';
export * from './schema';

// Config — defineConfig() generic + TypedEngineConfig
export { defaultConfig, mergeConfigs, defineConfig, createEngine } from './config/config';
export { ConfigBuilder } from './config/config-builder';
export type { TypedEngineConfig, GwenConfigServices } from './config/config';

// Typed plugin system — GwenPlugin interface
export type {
  GwenPlugin,
  AnyGwenPlugin,
  GwenPluginMeta,
  PluginProvides,
  MergeProvides,
  UnionToIntersection,
} from './plugin-system/plugin';

// System definition — defineSystem() for game logic
export { defineSystem } from './plugin-system/system';
export type { System, SystemBody, SystemFactory } from './plugin-system/system';

// ECS internals (kept for tests / advanced usage)
export { EntityManager, ComponentRegistry, QueryEngine } from './core/ecs';

// Engine
export { Engine, getEngine, useEngine, resetEngine } from './engine/engine';
export type { EntityId } from './engine/engine-api';

// API & ServiceLocator
export { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api/api';
export type { EngineState } from './api/api';

// Plugin manager
export { PluginManager } from './plugin-system/plugin-manager';

// Scene system
export { SceneManager, defineScene } from './api/scene';
export type { Scene, SceneBody } from './api/scene';

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
