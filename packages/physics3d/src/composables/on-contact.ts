/**
 * @file onContact() — register a callback for 3D contact events this frame.
 */
import type { ContactEvent3D } from '../types.js';

/** Registry of all active contact callbacks for the current frame. */
const _contactCallbacks: ((e: ContactEvent3D) => void)[] = [];

/**
 * Register a callback to be invoked for every 3D contact event dispatched this frame.
 *
 * Must be called inside an active engine context (inside `defineSystem()`,
 * `engine.run()`, or a plugin lifecycle hook).
 *
 * A {@link ContactEvent3D} includes full 3D contact point, normal, relative velocity,
 * and restitution data. All coordinate fields include Z components.
 *
 * @param callback - Function invoked with each {@link ContactEvent3D}.
 *
 * @example
 * ```typescript
 * onContact((contact) => {
 *   if (contact.relativeVelocity > 5) {
 *     playImpactSound(contact.contactX, contact.contactY, contact.contactZ)
 *   }
 * })
 * ```
 *
 * @since 1.0.0
 */
export function onContact(callback: (contact: ContactEvent3D) => void): void {
  _contactCallbacks.push(callback);
}

/**
 * Dispatch a contact event to all registered callbacks.
 *
 * Called by the Physics3D plugin during the `onUpdate` phase after draining
 * the SAB ring buffer. Not intended for direct use in game code.
 *
 * @param event - The contact event to dispatch.
 * @internal
 */
export function _dispatchContactEvent(event: ContactEvent3D): void {
  for (const cb of _contactCallbacks) {
    cb(event);
  }
}

/**
 * Remove all registered contact callbacks.
 *
 * Used in tests and plugin teardown to reset the callback registry.
 *
 * @internal
 */
export function _clearContactCallbacks(): void {
  _contactCallbacks.length = 0;
}
