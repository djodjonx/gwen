/**
 * @file GwenProvides augmentations for @gwenengine/debug.
 *
 * Importing any symbol from `@gwenengine/debug` automatically augments
 * `@gwenengine/core` with a typed debug service key.
 */

import type { DebugService } from './index.js';

declare module '@gwenengine/core' {
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
