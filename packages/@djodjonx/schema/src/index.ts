/**
 * GWEN Configuration Schema - Main Entry Point
 *
 * Single source of truth for GWEN engine configuration types and defaults.
 *
 * @module @djodjonx/gwen-schema
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
  GwenHooks,
} from './hooks';

// Runtime
export { defaultOptions, resolveConfig } from './defaults';
export { validateResolvedConfig } from './validate';
