/**
 * @file RFC-009 — GwenProvides and GwenRuntimeHooks augmentations for @gwenengine/physics2d.
 *
 * This file contains only TypeScript declaration merging — no runtime code.
 * Importing any symbol from `@gwenengine/physics2d` automatically augments
 * `@gwenengine/core` with typed physics service keys and hooks.
 */

import type { Physics2DAPI } from './types.js';
import type { EntityId } from '@gwenengine/core';

declare module '@gwenengine/core' {
  /**
   * Physics 2D service slot in the engine's provide/inject registry.
   * Available after `engine.use(physics2dPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const api = engine.inject('physics2d') // typed as Physics2DAPI
   * ```
   */
  interface GwenProvides {
    physics2d: Physics2DAPI;
  }

  /**
   * Physics 2D runtime hooks augmenting the engine hook bus.
   * Subscribe via `engine.hooks.hook('physics2d:step', ...)`.
   */
  interface GwenRuntimeHooks {
    /** Fired after the physics step completes (between Phase 3 and Phase 5). */
    'physics2d:step': (stepDt: number) => void;
    /** Fired when a collision begins between two entities. */
    'physics2d:collisionStart': (entityA: EntityId, entityB: EntityId) => void;
    /** Fired when a collision ends between two entities. */
    'physics2d:collisionEnd': (entityA: EntityId, entityB: EntityId) => void;
  }
}

// Ensure this file is treated as a module (required for declaration merging).
export {};
