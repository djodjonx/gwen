/**
 * GWEN Configuration Schema - Main Entry Point
 *
 * Single source of truth for GWEN engine configuration types and defaults.
 *
 * @module @gwen/schema
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

// Runtime
export { defaultOptions, resolveConfig } from './defaults';
export { validateResolvedConfig } from './validate';
