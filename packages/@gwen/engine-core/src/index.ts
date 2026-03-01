// GWEN Engine Core — Public API

// Types (source of truth for shared types)
export * from './types';
export * from './config';

// ECS internals (EntityManager, ComponentRegistry, QueryEngine)
export { EntityManager, ComponentRegistry, QueryEngine } from './ecs';

// Engine (main class + global instance helpers)
export { Engine, getEngine, useEngine, resetEngine } from './engine';

// API & ServiceLocator
export { ServiceLocator, EngineAPIImpl, createEngineAPI } from './api';
export type { EngineState } from './api';

// Plugin system
export { PluginManager } from './plugin-manager';

// Renderer
export { Canvas2DRenderer } from './renderer';
export type { SpriteComponent, TransformComponent, Camera, Canvas2DRendererConfig } from './renderer';
