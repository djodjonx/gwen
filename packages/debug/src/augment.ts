/**
 * @file GwenProvides augmentations for @gwenjs/debug.
 *
 * Importing any symbol from `@gwenjs/debug` automatically augments
 * `@gwenjs/core` with a typed debug service key.
 */

import type { DebugService } from './index';

declare module '@gwenjs/core' {
  /**
   * Debug service slot in the engine's provide/inject registry.
   * Available after `engine.use(DebugPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const debug = engine.inject('debug') // typed as DebugService
   * ```
   */
  interface GwenProvides {
    debug: DebugService;
  }
}

export {};
