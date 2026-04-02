/**
 * @file GwenProvides augmentations for @gwenjs/renderer-canvas2d.
 *
 * Importing any symbol from `@gwenjs/renderer-canvas2d` automatically
 * augments `@gwenjs/core` with a typed renderer service key.
 */

import type { RendererService } from './renderer.js';

declare module '@gwenjs/core' {
  /**
   * Canvas 2D renderer service slot in the engine's provide/inject registry.
   * Available after `engine.use(Canvas2DRenderer())` completes setup.
   *
   * @example
   * ```typescript
   * const renderer = engine.inject('renderer') // typed as RendererService
   * ```
   */
  interface GwenProvides {
    renderer: RendererService;
  }
}

export {};
