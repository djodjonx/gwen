/**
 * @file Public API barrel for `@gwenjs/renderer-canvas2d`.
 *
 * Re-exports every public symbol from the package so consumers only need a
 * single import path:
 *
 * ```typescript
 * import {
 *   Canvas2DRenderer,
 *   ShapeRenderer,
 *   useCanvas2D,
 * } from '@gwenjs/renderer-canvas2d';
 * ```
 *
 * @since 1.0.0
 */
// @gwenjs/gwen-renderer-canvas2d — Public API
export { Canvas2DRenderer } from './renderer';
export type {
  RendererService,
  RendererService as Canvas2DRendererService,
  SpriteComponent,
  TransformComponent,
  Camera,
  Canvas2DRendererConfig,
} from './renderer';

export { ShapeRenderer } from './shapes';
export type { RectOptions, CircleOptions, LineOptions, TextOptions } from './shapes';

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { useCanvas2D } from './composables.js';
