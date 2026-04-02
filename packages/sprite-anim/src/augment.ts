/**
 * @file GwenProvides augmentations for @gwenengine/sprite-anim.
 *
 * Importing any symbol from `@gwenengine/sprite-anim` automatically augments
 * `@gwenengine/core` with a typed sprite animator service key.
 */

import type { SpriteAnimatorService } from './index.js';

declare module '@gwenengine/core' {
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
