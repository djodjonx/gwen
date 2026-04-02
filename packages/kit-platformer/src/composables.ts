/**
 * @file Composables for @gwenjs/kit-platformer.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core';
import type { PlatformerKitService } from './plugin.js';
import './augment.js';

/**
 * Returns the platformer kit configuration service registered by `PlatformerKitPlugin()`.
 *
 * @returns The {@link PlatformerKitService} instance.
 * @throws {GwenPluginNotFoundError} If `PlatformerKitPlugin()` is not registered.
 *
 * @example
 * ```typescript
 * export const platformerSystem = defineSystem(() => {
 *   const kit = usePlatformer()
 *   // Use kit.config.components.position etc.
 * })
 * ```
 */
export function usePlatformer(): PlatformerKitService {
  const engine = useEngine();
  const service = engine.tryInject('platformer');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/kit-platformer',
    hint: "Add '@gwenjs/kit-platformer' to modules in gwen.config.ts",
    docsUrl: 'https://gwenengine.dev/kits/platformer',
  });
}
