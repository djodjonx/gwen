/**
 * GWEN Configuration Schema - Main Entry Point
 *
 * Single source of truth for GWEN engine configuration types and defaults.
 *
 * @module @gwenengine/schema
 */

// Types
export type {
  GwenTypeRefMeta,
  GwenPluginMeta,
  GwenPluginBase,
  GwenOptions,
  GwenConfigInput,
  DeepPartial,
  EngineAPI,
} from './config';

export type {
  EngineLifecycleHooks,
  PluginLifecycleHooks,
  EntityLifecycleHooks,
  ComponentLifecycleHooks,
  SceneLifecycleHooks,
  ExtensionLifecycleHooks,
  GwenHooks,
} from './hooks';

// Runtime
export { defaultOptions, resolveConfig } from './defaults.js';
export { validateResolvedConfig } from './validate.js';
