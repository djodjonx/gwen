// GWEN Engine Core — Public API

// Types (source of truth for shared types)
export * from './types';
export * from './schema';

// Config — defineConfig() générique + TypedEngineConfig
export {
  defaultConfig,
  mergeConfigs,
  defineConfig,
  ConfigBuilder,
} from './config';
export type { TypedEngineConfig, GwenConfigServices } from './config';

// Plugin system typé — GwenPlugin<N, P> + createPlugin()
export { createPlugin } from './plugin';
export type {
  GwenPlugin,
  AnyGwenPlugin,
  GwenPluginDef,
  PluginProvides,
  MergeProvides,
  UnionToIntersection,
} from './plugin';

// ECS internals (gardés pour les tests / usages avancés)
export { EntityManager, ComponentRegistry, QueryEngine } from './ecs';

// Engine
export { Engine, getEngine, useEngine, resetEngine } from './engine';

// API & ServiceLocator
export { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api';
export type { EngineState } from './api';

// Plugin manager
export { PluginManager } from './plugin-manager';

// Scene system
export { SceneManager } from './scene';
export type { Scene } from './scene';

// UI system
export { UIManager, defineUI, UIComponent } from './ui';
export type { UIDefinition, UIRenderContext } from './ui';

// Prefab system
export { definePrefab, PrefabManager } from './prefab';
export type { PrefabDefinition } from './prefab';

// WASM Bridge
export { initWasm, getWasmBridge, _resetWasmBridge, _injectMockWasmEngine } from './wasm-bridge';
export type { WasmBridge, WasmEntityId, WasmEngine, GwenCoreWasm } from './wasm-bridge';

