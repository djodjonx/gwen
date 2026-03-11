/**
 * @file contracts.ts
 * @description
 * Public runtime contracts (injectable interfaces) for sprite animation runtime.
 *
 * These interfaces define the only dependency-injection boundaries:
 * - `SpriteAnimEventSink`
 * - `SpriteAnimImageLoader`
 * - `SpriteAnimLogger`
 * - `SpriteAnimRuntimeDeps`
 * - `SpriteAnimRuntimeConfig`
 *
 * All other concerns (maps, pooling, state machine, tick loop)
 * are intentionally internal and non-injectable.
 */

import type { EntityId } from '@djodjonx/gwen-engine-core';

/**
 * Animation event receiver.
 * Decouples runtime internals from engine hook implementations.
 */
export interface SpriteAnimEventSink {
  /** Called whenever a frame is advanced in the active clip. */
  onFrame?: (
    entityId: EntityId,
    clip: string,
    state: string,
    frameCursor: number,
    frameIndex: number,
  ) => void;

  /** Called when a non-looping clip reaches its end. */
  onComplete?: (entityId: EntityId, clip: string, state: string) => void;

  /** Called when a controller state transition succeeds. */
  onTransition?: (entityId: EntityId, fromState: string, toState: string) => void;
}

/**
 * HTML image factory abstraction.
 * Allows replacing `new Image()` in tests, SSR, or restricted runtimes.
 */
export interface SpriteAnimImageLoader {
  /**
   * Creates a new `HTMLImageElement` instance.
   * Returns `null` if image creation is not supported in the environment.
   */
  createImage(): HTMLImageElement | null;
}

/** Logger abstraction used by runtime warnings. */
export interface SpriteAnimLogger {
  /** Emits a non-fatal warning message. */
  warn(message: string): void;
}

/** Runtime tuning options. */
export interface SpriteAnimRuntimeConfig {
  /**
   * Maximum number of frame advances per entity per tick.
   * Prevents runaway updates for large delta spikes.
   * @default 16
   */
  maxFrameAdvancesPerEntity?: number;

  /**
   * Enables runtime culling semantics.
   * Culled entities are skipped by `tick()`.
   * @default true
   */
  enableCulling?: boolean;
}

/**
 * Root dependency bag passed to `SpriteAnimRuntime`.
 *
 * All fields are optional:
 * - no events sink: runtime still works without hook callbacks
 * - no image loader: uses default browser image factory
 * - no logger: uses default warning logger
 */
export interface SpriteAnimRuntimeDeps {
  /** Animation events sink. */
  events?: SpriteAnimEventSink;

  /** Image loader abstraction for atlas creation/loading. */
  imageLoader?: SpriteAnimImageLoader;

  /** Logger used for runtime warnings. */
  logger?: SpriteAnimLogger;
}

/** Default logger implementation (`console.warn`). */
export const defaultLogger: SpriteAnimLogger = {
  warn: (message) => console.warn(message),
};

/**
 * Default image loader implementation.
 * Uses browser `Image` when available.
 */
export const defaultImageLoader: SpriteAnimImageLoader = {
  createImage(): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    return new Image();
  },
};
