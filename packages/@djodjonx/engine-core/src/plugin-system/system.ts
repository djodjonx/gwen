/**
 * GWEN System Definition — game logic without plugin features
 *
 * `defineSystem()` creates a system for game logic (movement, collision, AI, etc.).
 * Systems are pure gameplay logic with no service injection or metadata.
 *
 * Use `defineSystem()` for:
 * - Game mechanics (Movement, Collision, Spawner)
 * - Entity processing
 * - State management
 *
 * Use `createPlugin()` for:
 * - Framework integrations (Input, Audio, Renderer)
 * - Service providers (with `provides`)
 * - External library wrappers
 *
 * **Form 1 — direct object** (no local state):
 * ```typescript
 * export const MovementSystem = defineSystem({
 *   name: 'MovementSystem',
 *   onUpdate(api, dt) { ... },
 * });
 * // Usage:
 * scene.plugins = [MovementSystem];
 * ```
 *
 * **Form 2 — factory** (with local state in closure):
 * ```typescript
 * export const SpawnerSystem = defineSystem('SpawnerSystem', () => {
 *   let timer = 0;
 *   return {
 *     onInit()        { timer = 0; },
 *     onUpdate(_, dt) { timer += dt; },
 *   };
 * });
 * // Usage:
 * scene.plugins = [SpawnerSystem()];
 * ```
 */

import type { TsPlugin } from '../types';

// ── System interface ────────────────────────────────────────────────────────

/**
 * A named game system — pure logic with no service injection.
 *
 * Extends `TsPlugin` to participate in the engine game loop.
 * Use `defineSystem()` to create systems; do not implement this interface directly.
 *
 * Lifecycle: `onInit` → `onBeforeUpdate` / `onUpdate` / `onRender` per frame → `onDestroy`.
 */
export interface System extends TsPlugin {
  readonly name: string;
}

/**
 * The body of a `System` definition — everything except `name`.
 * Used internally by the factory overload of `defineSystem(name, factory)`.
 */
export type SystemBody = Omit<System, 'name'>;

/**
 * Callable factory returned by `defineSystem(name, factory)`.
 *
 * The attached `systemName` property allows introspection without calling the factory:
 * ```ts
 * SpawnerSystem.systemName; // 'SpawnerSystem'
 * ```
 *
 * @typeParam Args Extra arguments forwarded to the inner factory.
 */
export type SystemFactory<Args extends unknown[] = []> = ((...args: Args) => System) & {
  readonly systemName: string;
};

// ── defineSystem() ────────────────────────────────────────────────────────────

/**
 * Define a game system with optional local state.
 *
 * Systems are pure gameplay logic with no service injection or metadata.
 * Use for game mechanics (Movement, Collision, Spawner, etc.).
 *
 * **Form 1 — direct object** (no local state):
 * ```typescript
 * export const MovementSystem = defineSystem({
 *   name: 'MovementSystem',
 *   onUpdate(api, dt) { ... },
 * });
 * scene.plugins = [MovementSystem];
 * ```
 *
 * **Form 2 — factory** (with local state):
 * ```typescript
 * export const SpawnerSystem = defineSystem('SpawnerSystem', () => {
 *   let timer = 0;
 *   return {
 *     onInit() { timer = 0; },
 *     onUpdate(_, dt) { timer += dt; },
 *   };
 * });
 * scene.plugins = [SpawnerSystem()];
 * ```
 *
 * @param def - System definition (object form)
 * @returns The system object ready to register in scenes
 */
export function defineSystem(def: System): System;

/**
 * Define a game system factory with local state.
 *
 * Allows systems to maintain internal state without global variables.
 *
 * @param name - Unique system name
 * @param factory - Function returning system implementation with local state
 * @returns Callable factory that creates system instances
 */
export function defineSystem<Args extends unknown[] = []>(
  name: string,
  factory: (...args: Args) => SystemBody,
): SystemFactory<Args>;

// Implementation
export function defineSystem<Args extends unknown[] = []>(
  nameOrDef: string | System,
  factory?: (...args: Args) => SystemBody,
): System | SystemFactory<Args> {
  if (typeof nameOrDef === 'string') {
    // Form 2 — factory
    const fn = (...args: Args): System => ({
      name: nameOrDef,
      ...factory!(...args),
    });
    (fn as any).systemName = nameOrDef;
    return fn as SystemFactory<Args>;
  }
  // Form 1 — direct object
  return nameOrDef as System;
}
