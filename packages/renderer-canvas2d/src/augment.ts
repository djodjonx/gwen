/**
 * @file GwenProvides augmentations for @gwenjs/renderer-canvas2d.
 *
 * Importing any symbol from `@gwenjs/renderer-canvas2d` automatically
 * augments `@gwenjs/core` with a typed renderer service key.
 */

import type { RendererService } from './plugin/renderer.js';

declare module '@gwenjs/core' {
  /**
   * Canvas 2D renderer service slot in the engine's provide/inject registry.
   *
   * Available after `engine.use(Canvas2DRenderer())` completes its `setup`
   * lifecycle hook.
   *
   * @example
   * ```typescript
   * import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d';
   *
   * const renderer = engine.inject('renderer'); // typed as RendererService
   * renderer.setCamera({ zoom: 2 });
   * ```
   *
   * @since 1.0.0
   */
  interface GwenProvides {
    renderer: RendererService;
  }
}

export {};
