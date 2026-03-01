// GWEN Engine Core — Public API

// Types (source of truth for shared types)
export * from './types';
export * from './config';
export * from './schema';

// ECS internals
export { EntityManager, ComponentRegistry, QueryEngine } from './ecs';

// Engine
export { Engine, getEngine, useEngine, resetEngine } from './engine';

// API & ServiceLocator
export { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api';
export type { EngineState } from './api';

// Plugin system
export { PluginManager } from './plugin-manager';

// Scene system
export { SceneManager } from './scene';
export type { Scene } from './scene';

// UI system
export { UIManager, defineUI, UIComponent } from './ui';
export type { UIDefinition, UIRenderContext } from './ui';

// Prefab system
export { definePrefab, PrefabManager } from './prefab';

// WASM Bridge — optional Rust/WASM core integration
export { initWasm, getWasmBridge, _resetWasmBridge } from './wasm-bridge';
export type { WasmBridge, WasmEntityId, WasmEngine, GwenCoreWasm } from './wasm-bridge';
export type { PrefabDefinition } from './prefab';

