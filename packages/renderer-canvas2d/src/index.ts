// @gwenjs/gwen-renderer-canvas2d — Public API
export { Canvas2DRenderer, pluginMeta } from './renderer';
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
export { default } from './module.js';
