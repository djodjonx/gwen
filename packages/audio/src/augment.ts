/**
 * @file GwenProvides augmentations for @gwenjs/audio.
 *
 * Importing any symbol from `@gwenjs/audio` automatically augments
 * `@gwenjs/core` with a typed audio service key.
 */

import type { AudioService } from './index.js';

declare module '@gwenjs/core' {
  /**
   * Audio service slot in the engine's provide/inject registry.
   * Available after `engine.use(AudioPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const audio = engine.inject('audio') // typed as AudioService
   * ```
   */
  interface GwenProvides {
    audio: AudioService;
  }
}

export {};
