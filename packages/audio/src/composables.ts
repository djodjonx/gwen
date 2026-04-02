/**
 * @file Composables for @gwenengine/audio.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenengine/core';
import type { AudioService } from './index.js';
import './augment.js';

/**
 * Returns the audio service registered by `AudioPlugin()`.
 *
 * @returns The {@link AudioService} instance.
 * @throws {GwenPluginNotFoundError} If `AudioPlugin()` is not registered.
 *
 * @example
 * ```typescript
 * export const soundSystem = defineSystem(() => {
 *   const audio = useAudio()
 *   onUpdate(() => {
 *     if (playerHit) audio.play('hurt')
 *   })
 * })
 * ```
 */
export function useAudio(): AudioService {
  const engine = useEngine();
  const service = engine.tryInject('audio');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenengine/audio',
    hint: "Add '@gwenengine/audio' to modules in gwen.config.ts",
    docsUrl: 'https://gwenengine.dev/plugins/audio',
  });
}
