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
 * A game system — pure logic without plugin services.
 * Lifecycle: onInit → onBeforeUpdate/onUpdate/onRender per frame → onDestroy.
 */
export interface System extends TsPlugin {
  readonly name: string;
}

/**
 * System definition body (without `name` — for factory form).
 */
export type SystemBody = Omit<System, 'name'>;

/**
 * System factory returned by `defineSystem(name, factory)`.
 * Carries `systemName` for introspection.
 */
export type SystemFactory<Args extends unknown[] = []> = (
  (...args: Args) => System
) & { readonly systemName: string };

// ── defineSystem() ────────────────────────────────────────────────────────────

// Overload 1 — direct object
export function defineSystem(def: System): System;

// Overload 2 — factory
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
