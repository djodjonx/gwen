/**
 * @file Composables for @gwenengine/sprite-anim.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenengine/core';
import type { SpriteAnimatorService } from './index.js';
import './augment.js';

/**
 * Returns the sprite animator service registered by `SpriteAnimPlugin()`.
 *
 * @returns The {@link SpriteAnimatorService} instance.
 * @throws {GwenPluginNotFoundError} If `SpriteAnimPlugin()` is not registered.
 *
 * @example
 * ```typescript
 * export const animSystem = defineSystem(() => {
 *   const anim = useSpriteAnim()
 *   onUpdate((dt) => {
 *     anim.tick(entityId, dt)
 *   })
 * })
 * ```
 */
export function useSpriteAnim(): SpriteAnimatorService {
  const engine = useEngine();
  const service = engine.tryInject('animator');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenengine/sprite-anim',
    hint: "Add '@gwenengine/sprite-anim' to modules in gwen.config.ts",
    docsUrl: 'https://gwenengine.dev/plugins/sprite-anim',
  });
}
