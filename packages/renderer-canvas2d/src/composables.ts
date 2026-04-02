/**
 * @file Composables for @gwenjs/renderer-canvas2d.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core';
import type { RendererService } from './renderer.js';
import './augment.js';

/**
 * Returns the Canvas 2D renderer service registered by `Canvas2DRenderer()`.
 *
 * @returns The {@link RendererService} instance.
 * @throws {GwenPluginNotFoundError} If `Canvas2DRenderer()` is not registered.
 *
 * @example
 * ```typescript
 * export const renderSystem = defineSystem(() => {
 *   const renderer = useCanvas2D()
 *   onRender(() => {
 *     renderer.drawRect(x, y, width, height)
 *   })
 * })
 * ```
 */
export function useCanvas2D(): RendererService {
  const engine = useEngine();
  const service = engine.tryInject('renderer');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/renderer-canvas2d',
    hint: "Add '@gwenjs/renderer-canvas2d' to modules in gwen.config.ts",
    docsUrl: 'https://gwenengine.dev/plugins/renderer-canvas2d',
  });
}
