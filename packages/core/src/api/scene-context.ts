/**
 * @file Scene Reload Context
 *
 * Context information passed to scene reload evaluators.
 * Used by `reloadOnReenter` function to decide if a scene should reload.
 */

import type { EngineAPI } from '../types';

/**
 * Context passed to scene reload evaluator.
 *
 * Contains information about the transition to help decide if reload is needed.
 *
 * @example
 * ```typescript
 * reloadOnReenter: (api, ctx) => {
 *   // Reload only if coming back after game over
 *   return ctx.data?.reason === 'gameOver';
 * }
 * ```
 */
export interface ReloadContext {
  /**
   * Name of the scene we're coming from.
   * `null` if this is the first scene loaded.
   */
  fromScene: string | null;

  /**
   * Name of the scene we're transitioning to.
   */
  toScene: string;

  /**
   * True if we're re-entering the same scene (fromScene === toScene).
   */
  isReenter: boolean;

  /**
   * Number of times this scene has been entered (cumulative).
   * Increments each time onEnter is called.
   *
   * @example
   * ```typescript
   * // Reload only after 3rd+ entry
   * reloadOnReenter: (api, ctx) => ctx.enterCount >= 3
   * ```
   */
  enterCount: number;

  /**
   * Custom data passed via `scene.load(name, data)`.
   * Use this to pass context about why the scene is loading.
   *
   * @example
   * ```typescript
   * // In game code
   * api.scene.load('Game', { reason: 'gameOver', score: 1000 });
   *
   * // In scene definition
   * reloadOnReenter: (api, ctx) => ctx.data?.reason === 'gameOver'
   * ```
   */
  data?: Record<string, unknown>;
}

/**
 * Evaluator function to determine if a scene should reload on re-enter.
 *
 * Called by SceneManager when transitioning to a scene that's already active.
 * Return `true` to reload (destroy + recreate), `false` to keep existing state.
 *
 * @param api - Engine API for accessing services, hooks, etc.
 * @param context - Context about the transition
 * @returns `true` to reload, `false` to keep state
 *
 * @example
 * ```typescript
 * // Reload only if player died
 * const evaluator: ReloadEvaluator = (api, ctx) => {
 *   return ctx.data?.reason === 'died';
 * };
 * ```
 */
export type ReloadEvaluator = (api: EngineAPI, context: ReloadContext) => boolean;
