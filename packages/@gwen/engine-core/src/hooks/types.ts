/**
 * @file GWEN Hooks System — Complete type definitions
 *
 * Defines all hooks available in the GWEN engine using @unjs/hookable.
 * Provides full type safety for engine lifecycle, plugins, entities, components, and scenes.
 *
 * @example
 * ```typescript
 * // In a plugin:
 * onInit(api: EngineAPI) {
 *   // Hook with full type safety
 *   api.hooks.hook('entity:create', (id) => {
 *     console.log('Entity created:', id);
 *   });
 * }
 * ```
 */

/**
 * GWEN hooks type bridge.
 *
 * Base hook contracts now live in `@gwen/schema` and engine-core binds them
 * to concrete runtime types.
 */

import type { GwenHooks as SchemaGwenHooks } from '@gwen/schema';

export type EngineLifecycleHooks = import('@gwen/schema').EngineLifecycleHooks;
export type PluginLifecycleHooks = import('@gwen/schema').PluginLifecycleHooks<any, any>;
export type EntityLifecycleHooks = import('@gwen/schema').EntityLifecycleHooks<
  import('../types').EntityId
>;
export type ComponentLifecycleHooks = import('@gwen/schema').ComponentLifecycleHooks<
  import('../types').EntityId
>;
export type SceneLifecycleHooks = import('@gwen/schema').SceneLifecycleHooks<
  import('../api/scene-context').ReloadContext
>;

/** Engine-core concrete hooks map used by Hookable. */
export interface GwenHooks extends SchemaGwenHooks<
  import('../types').EntityId,
  any,
  any,
  import('../api/scene-context').ReloadContext
> {}
