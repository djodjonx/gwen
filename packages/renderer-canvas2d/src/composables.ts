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
 * Returns the Canvas 2D renderer service registered by {@link Canvas2DRenderer}.
 *
 * Must be called inside an active engine context — e.g., inside a
 * `defineSystem()` callback, `engine.run(fn)`, or a plugin lifecycle hook.
 *
 * @returns The {@link RendererService} instance bound to the running engine.
 * @throws {GwenPluginNotFoundError} When `Canvas2DRenderer()` has not been
 *   registered in the current engine's plugin list.
 *
 * @example
 * ```typescript
 * import { defineSystem } from '@gwenjs/kit';
 * import { useCanvas2D } from '@gwenjs/renderer-canvas2d';
 *
 * export const hudSystem = defineSystem(() => {
 *   const renderer = useCanvas2D();
 *
 *   return {
 *     onRender() {
 *       const { ctx, logicalWidth } = renderer;
 *       ctx.fillStyle = '#ffffff';
 *       ctx.font = '16px sans-serif';
 *       ctx.fillText('Score: 0', logicalWidth / 2, 16);
 *     },
 *   };
 * });
 * ```
 *
 * @since 1.0.0
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
