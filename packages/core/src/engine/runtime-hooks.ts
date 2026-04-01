import type { EntityId } from './engine-api.js';

/**
 * Base runtime hook map for the GWEN engine.
 *
 * Extended by plugin packages via TypeScript declaration merging.
 *
 * @example Augmenting with plugin hooks
 * ```typescript
 * // In a plugin package's index.d.ts:
 * declare module '@gwenengine/core' {
 *   interface GwenRuntimeHooks {
 *     'my:event': (payload: MyPayload) => void
 *   }
 * }
 * ```
 */
export interface GwenRuntimeHooks {
  /** Fired once when `engine.start()` is called, after all plugins are set up. */
  'engine:init': () => void;
  /** Fired once when `engine.start()` begins the RAF loop. */
  'engine:start': () => void;
  /** Fired once when `engine.stop()` tears down the engine. */
  'engine:stop': () => void;
  /** Fired at the start of every tick, before any phase runs. */
  'engine:tick': (dt: number) => void;
  /** Fired at the end of every tick, after the render phase. */
  'engine:afterTick': (dt: number) => void;
  /** Fired when a new entity is created. */
  'entity:spawn': (id: EntityId) => void;
  /** Fired when an entity is destroyed. */
  'entity:destroy': (id: EntityId) => void;
}
