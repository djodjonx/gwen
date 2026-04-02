/**
 * @file GwenProvides and GwenRuntimeHooks augmentations for @gwenengine/physics3d.
 *
 * This file contains only TypeScript declaration merging — no runtime code.
 * Importing any symbol from `@gwenengine/physics3d` automatically augments
 * `@gwenengine/core` with typed physics service keys and hooks.
 */

import type { Physics3DAPI } from './types.js';
import type { EntityId } from '@gwenengine/core';

declare module '@gwenengine/core' {
  /**
   * Physics 3D service slot in the engine's provide/inject registry.
   * Available after `engine.use(physics3dPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const api = engine.inject('physics3d') // typed as Physics3DAPI
   * ```
   */
  interface GwenProvides {
    physics3d: Physics3DAPI;
  }

  /**
   * Physics 3D runtime hooks augmenting the engine hook bus.
   */
  interface GwenRuntimeHooks {
    /** Fired after the physics step completes. */
    'physics3d:step': (stepDt: number) => void;
    /** Fired when a collision begins between two entities. */
    'physics3d:collisionStart': (entityA: EntityId, entityB: EntityId) => void;
    /** Fired when a collision ends between two entities. */
    'physics3d:collisionEnd': (entityA: EntityId, entityB: EntityId) => void;
  }
}

export {};
