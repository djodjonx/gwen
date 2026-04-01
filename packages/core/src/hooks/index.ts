/**
 * @file GWEN Hooks System — Factory and type exports
 *
 * Provides the core hooks system for GWEN engine using @unjs/hookable.
 * The hooks system enables plugins to extend engine behavior through well-defined
 * lifecycle points.
 *
 * @example Basic usage
 * ```typescript
 * import { createGwenHooks } from '@gwenengine/core';
 *
 * const hooks = createGwenHooks();
 *
 * // Register a handler
 * hooks.hook('entity:create', (id) => {
 *   console.log('Entity created:', id);
 * });
 *
 * // Call the hook (automatically called by engine)
 * await hooks.callHook('entity:create', 42);
 * ```
 *
 * @example In a plugin
 * ```typescript
 * import { defineSystem } from '@gwenengine/core';
 *
 * export const MyPlugin = defineSystem({
 *   name: 'MyPlugin',
 *   onInit(api) {
 *     api.hooks.hook('entity:create', (id) => {
 *       console.log('Entity created:', id);
 *     });
 *   }
 * });
 * ```
 */

import { createHooks } from 'hookable';
import type { Hookable } from 'hookable';
import type { GwenHooks } from './types';

// ════════════════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════════════════

export type {
  EngineLifecycleHooks,
  PluginLifecycleHooks,
  EntityLifecycleHooks,
  ComponentLifecycleHooks,
  SceneLifecycleHooks,
  ExtensionLifecycleHooks,
} from '@gwenengine/schema';

export type { GwenHooks } from './types';

/**
 * Type alias for a GWEN hooks instance.
 *
 * Intentionally unconstrained (`H extends Record<string, any>` rather than
 * `extends GwenHooks`) so that `GwenDefaultHooks` — which carries an open
 * index signature `[key: string]: any` — can be used as `H` without error.
 *
 * Defaults to `GwenHooks` (system hooks only) for tests and internal usage.
 * In a project, `gwen prepare` generates:
 * ```typescript
 * interface GwenDefaultHooks extends _GwenHooks {} // enriched with plugin hooks
 * ```
 */
export type GwenHookable<H extends Record<string, any> = GwenHooks> = Hookable<H>;

// ════════════════════════════════════════════════════════════════════════════
// Factory
// ════════════════════════════════════════════════════════════════════════════

/**
 * Create a new GWEN hooks instance.
 *
 * Creates a fully typed and initialized Hookable instance with all GWEN hooks.
 * This is typically called once during engine initialization and passed to all
 * plugins via the EngineAPI.
 *
 * **Features:**
 * - Full TypeScript type safety
 * - Sequential hook execution (first-registered, first-executed)
 * - Async/await support for all hooks
 * - Custom hooks support via generic index signature
 * - Automatic error propagation from hook handlers
 *
 * @returns A new GwenHookable instance ready to use
 *
 * @example Basic initialization
 * ```typescript
 * import { createGwenHooks } from '@gwenengine/core';
 *
 * const hooks = createGwenHooks();
 * ```
 *
 * @example Registering and calling hooks
 * ```typescript
 * const hooks = createGwenHooks();
 *
 * // Register a handler
 * const unregister = hooks.hook('entity:create', (id) => {
 *   console.log('Entity:', id);
 * });
 *
 * // Call the hook
 * await hooks.callHook('entity:create', 42);
 *
 * // Unregister if needed
 * unregister();
 * ```
 *
 * @example Custom hooks usage
 * ```typescript
 * const hooks = createGwenHooks();
 *
 * // Create a custom hook
 * hooks.hook('physics:collision' as any, (event) => {
 *   console.log('Collision:', event);
 * });
 *
 * // Call it
 * await hooks.callHook('physics:collision' as any, { bodyA: 1, bodyB: 2 });
 * ```
 *
 * @see {@link GwenHooks} for available hooks
 * @see {@link GwenHookable} for the return type
 * @see https://github.com/unjs/hookable for hookable documentation
 */
export function createGwenHooks<H extends Record<string, any> = GwenHooks>(): GwenHookable<H> {
  return createHooks<H>();
}
