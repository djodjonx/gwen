/**
 * GWEN Types — Central exports for all type definitions
 */

// Entity & Component types
export type { EntityId, ComponentAccessor } from './entity';
export { createEntityId, unpackEntityId } from './entity';

// Engine API types
export type {
  EngineAPI,
  TypedServiceLocator,
  IPluginRegistrar,
  SceneNavigator,
} from './engine-api';

// Plugin types
export type { GwenPlugin, GwenPluginWasmContext, PluginEntry } from './plugin';
export type { PluginChannel, DataChannel, EventChannel, GwenEvent } from './plugin-channel';

// Engine config types
export type { EngineConfig } from './engine-config';
