/**
 * @file GWEN Hooks System — Complete type definitions
 *
 * Defines all hooks available in the GWEN engine using @unjs/hookable.
 * Provides full type safety for engine lifecycle, plugins, entities, and components.
 */

import type { GwenHooks as SchemaGwenHooks } from '@gwenengine/schema';

export type EngineLifecycleHooks = import('@gwenengine/schema').EngineLifecycleHooks;
export type PluginLifecycleHooks = import('@gwenengine/schema').PluginLifecycleHooks<any, any>;
export type EntityLifecycleHooks = import('@gwenengine/schema').EntityLifecycleHooks<
  import('../types').EntityId
>;
export type ComponentLifecycleHooks = import('@gwenengine/schema').ComponentLifecycleHooks<
  import('../types').EntityId
>;

/** Engine-core concrete hooks map used by Hookable. */
export interface GwenHooks extends SchemaGwenHooks<
  import('../types').EntityId,
  any,
  any,
  unknown
> {}
