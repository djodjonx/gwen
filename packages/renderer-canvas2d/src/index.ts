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
export { Canvas2DRenderer } from './plugin/renderer';
export type {
  RendererService,
  RendererService as Canvas2DRendererService,
  SpriteComponent,
  TransformComponent,
  Camera,
  Canvas2DRendererConfig,
} from './plugin/renderer';

export { ShapeRenderer } from './plugin/shapes';
export type { RectOptions, CircleOptions, LineOptions, TextOptions } from './plugin/shapes';

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment';
export { useCanvas2D } from './composables';
