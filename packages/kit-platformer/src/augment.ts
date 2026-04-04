/**
 * @file GwenProvides augmentations for @gwenjs/kit-platformer.
 *
 * Importing any symbol from `@gwenjs/kit-platformer` automatically
 * augments `@gwenjs/core` with a typed platformer kit service key.
 */

import type { PlatformerKitService } from './plugin/index.js';

declare module '@gwenjs/core' {
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
    /**
     * Generic physics service slot used by kit-platformer systems.
     * Consumers register their physics implementation (e.g. `physics2d`) under
     * this key so that kit-platformer remains physics-implementation-agnostic.
     *
     * @example
     * ```typescript
     * // In your game setup, bridge the physics2d service:
     * engine.provide('physics', engine.inject('physics2d'));
     * ```
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    physics: any;
  }
}

export {};
