/**
 * @file GwenProvides augmentations for @gwenjs/sprite-anim.
 *
 * Importing any symbol from `@gwenjs/sprite-anim` automatically augments
 * `@gwenjs/core` with a typed sprite animator service key.
 */

import type { SpriteAnimatorService } from './index.js';

declare module '@gwenjs/core' {
  /**
   * Sprite animator service slot in the engine's provide/inject registry.
   * Available after `engine.use(SpriteAnimPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const anim = engine.inject('animator') // typed as SpriteAnimatorService
   * ```
   */
  interface GwenProvides {
    animator: SpriteAnimatorService;
  }
}

export {};
