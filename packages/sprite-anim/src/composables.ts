/**
 * @file Composables for @gwenjs/sprite-anim.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core';
import type { SpriteAnimatorService } from './index';
import './augment';

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
    pluginName: '@gwenjs/sprite-anim',
    hint: "Add '@gwenjs/sprite-anim' to modules in gwen.config.ts",
    docsUrl: 'https://gwenengine.dev/plugins/sprite-anim',
  });
}
