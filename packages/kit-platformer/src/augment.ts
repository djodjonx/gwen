/**
 * @file GwenProvides augmentations for @gwenengine/kit-platformer.
 *
 * Importing any symbol from `@gwenengine/kit-platformer` automatically
 * augments `@gwenengine/core` with a typed platformer kit service key.
 */

import type { PlatformerKitService } from './plugin.js';

declare module '@gwenengine/core' {
  /**
   * Platformer kit service slot in the engine's provide/inject registry.
   * Available after `engine.use(PlatformerKitPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const platformer = engine.inject('platformer') // typed as PlatformerKitService
   * ```
   */
  interface GwenProvides {
    platformer: PlatformerKitService;
  }
}

export {};
