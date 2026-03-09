/**
 * GWEN Engine — public type barrel.
 *
 * All types are defined in focused single-responsibility modules under `./types/`.
 * Import from `@gwen/engine-core` as usual — this file re-exports everything.
 *
 * Module map:
 *   types/global-augment.ts  — GwenDefaultServices, GwenDefaultHooks (declare global)
 *   types/entity.ts          — EntityId, ComponentType, ComponentAccessor, Vector2D, Color
 *   types/engine-api.ts      — EngineAPI, TypedServiceLocator, IPluginRegistrar, SceneNavigator
 *   types/plugin.ts          — GwenPlugin, GwenPluginWasmContext, PluginEntry, isWasmPlugin (unified)
 *   types/plugin-ts.ts       — TsPlugin (deprecated alias → GwenPlugin)
 *   types/plugin-wasm.ts     — GwenWasmPlugin (deprecated alias), GwenPluginWasmContext
 *   types/plugin-channel.ts  — DataChannel, EventChannel, PluginChannel, GwenEvent, EVENT_*
 *   types/engine-config.ts   — EngineConfig, EngineStats
 */

export * from './types/global-augment';
export * from './types/entity';
export * from './types/engine-api';
export * from './types/plugin';
export * from './types/plugin-ts';
export * from './types/plugin-wasm';
export * from './types/plugin-channel';
export * from './types/engine-config';
