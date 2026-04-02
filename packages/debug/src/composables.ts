/**
 * @file Composables for @gwenjs/debug.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core';
import type { DebugService } from './index.js';
import './augment.js';

/**
 * Returns the debug service registered by `DebugPlugin()`.
 *
 * @returns The {@link DebugService} instance.
 * @throws {GwenPluginNotFoundError} If `DebugPlugin()` is not registered.
 *
 * @example
 * ```typescript
 * export const perfSystem = defineSystem(() => {
 *   const debug = useDebug()
 *   onUpdate(() => {
 *     debug.track('entityCount', entities.length)
 *   })
 * })
 * ```
 */
export function useDebug(): DebugService {
  const engine = useEngine();
  const service = engine.tryInject('debug');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/debug',
    hint: "Add '@gwenjs/debug' to modules in gwen.config.ts",
    docsUrl: 'https://gwenengine.dev/plugins/debug',
  });
}
