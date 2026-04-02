/**
 * @file GwenProvides augmentations for @gwenengine/ui.
 *
 * Importing any symbol from `@gwenengine/ui` automatically augments
 * `@gwenengine/core` with a typed HTML UI service key.
 */

import type { HtmlUI } from './index.js';

declare module '@gwenengine/core' {
  /**
   * HTML UI service slot in the engine's provide/inject registry.
   * Available after `engine.use(HtmlUIPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const ui = engine.inject('htmlUI') // typed as HtmlUI
   * ```
   */
  interface GwenProvides {
    htmlUI: HtmlUI;
  }
}

export {};
