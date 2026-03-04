/**
 * TypeScript plugin interface — TsPlugin lifecycle contract.
 *
 * A TsPlugin is any object that participates in the engine's game loop.
 * It can be a class instance, a plain object, or the result of `defineSystem()`.
 *
 * Frame order:
 *   onBeforeUpdate  →  (WASM step)  →  onUpdate  →  onRender
 * Once:
 *   onInit (on registration)  /  onDestroy (on removal or engine stop)
 */

import type { EngineAPI } from './engine-api';

/**
 * Core plugin interface — implement this to participate in the game loop.
 *
 * @example
 * ```ts
 * export const MovementSystem: TsPlugin = {
 *   name: 'MovementSystem',
 *   onUpdate(api, dt) {
 *     for (const id of api.query([Position, Velocity])) {
 *       const pos = api.getComponent(id, Position)!;
 *       const vel = api.getComponent(id, Velocity)!;
 *       api.addComponent(id, Position, { x: pos.x + vel.vx * dt, y: pos.y + vel.vy * dt });
 *     }
 *   },
 * };
 * ```
 */
export interface TsPlugin {
  /** Unique name — used for lookup (`engine.getSystem('name')`) and dedup checks. */
  readonly name: string;

  /**
   * Called once when the plugin is registered.
   * Set up services, hook subscriptions and initial state here.
   *
   * @param api Active engine API.
   */
  onInit?(api: EngineAPI): void;

  /**
   * Called at the very start of each frame — before the WASM simulation step.
   * Read raw inputs and set per-frame intentions here.
   *
   * @param api       Active engine API.
   * @param deltaTime Frame delta time in seconds (capped at 0.1 s).
   */
  onBeforeUpdate?(api: EngineAPI, deltaTime: number): void;

  /**
   * Called after the WASM step — apply game logic on the updated simulation state.
   *
   * @param api       Active engine API.
   * @param deltaTime Frame delta time in seconds (capped at 0.1 s).
   */
  onUpdate?(api: EngineAPI, deltaTime: number): void;

  /**
   * Called at the end of each frame — draw, update DOM, sync UI.
   * All component state written during `onUpdate` is visible here.
   *
   * @param api Active engine API.
   */
  onRender?(api: EngineAPI): void;

  /**
   * Called when the plugin is removed or the engine stops.
   * Cancel animation frames, remove event listeners, free allocated resources.
   */
  onDestroy?(): void;
}

/**
 * A plugin entry as declared in `Scene.systems[]`.
 *
 * Accepts either:
 * - a direct `TsPlugin` object (stateless systems)
 * - a no-arg factory `() => TsPlugin` (systems with private closure state)
 *
 * `SceneManager` resolves factories automatically when the scene activates.
 *
 * @example
 * ```ts
 * // Direct object (no local state)
 * systems: [MovementSystem]
 *
 * // Factory (private timer, counters, etc.)
 * systems: [SpawnerSystem]   // SpawnerSystem is () => TsPlugin
 * ```
 */
export type PluginEntry = TsPlugin | (() => TsPlugin);
