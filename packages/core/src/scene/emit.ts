/**
 * @file `emit()` — sugar over `engine.hooks.callHook` for RFC-011 Actor System.
 *
 * Lets you fire engine/game events from anywhere that has an active engine
 * context (inside `defineSystem`, `defineActor` factory, or an engine
 * lifecycle callback) without needing to hold a reference to the engine.
 */

import { useEngine } from '../context.js';
import type { GwenRuntimeHooks } from '../engine/runtime-hooks.js';

/**
 * Emits a named event via the engine's hookable system.
 *
 * Sugar over `engine.hooks.callHook(name, ...args)`. All hooks registered
 * with `engine.hooks.hook(name, fn)` for the given event name will be called
 * synchronously in registration order.
 *
 * Must be called within an active engine context (inside `defineSystem`,
 * a `defineActor` factory, or an engine lifecycle callback such as
 * `onUpdate`). Throws with a `[GWEN]`-prefixed message if called outside
 * any active context.
 *
 * @param name - The event name (must be a key of {@link GwenRuntimeHooks}).
 * @param args - Arguments forwarded to every registered handler.
 *
 * @throws {GwenContextError} If called outside an active engine context.
 *
 * @example Inside a system's onUpdate:
 * ```typescript
 * const mySystem = defineSystem(() => {
 *   onUpdate(() => {
 *     emit('entity:spawn', entityId)
 *   })
 * })
 * ```
 *
 * @example Inside an actor factory:
 * ```typescript
 * const PlayerActor = defineActor('Player', () => {
 *   emit('player:created', playerId)
 * })
 * ```
 */
export function emit<K extends keyof GwenRuntimeHooks>(
  name: K,
  ...args: Parameters<GwenRuntimeHooks[K]>
): void {
  const engine = useEngine();
  // callHook signature is variadic — spread args matches hookable's API
  engine.hooks.callHook(name, ...(args as Parameters<GwenRuntimeHooks[K]>));
}
