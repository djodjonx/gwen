import type { Physics2DAPI, PhysicsEntitySnapshot } from '../types.js';

/**
 * Read a compact read-only snapshot of one physics body slot.
 *
 * Combines position and velocity into a single lightweight object suitable
 * for rendering, AI, or gameplay decision logic. Both fields are nullable:
 * they return `null` when no rigid body has been registered for this slot yet.
 *
 * @param physics - Physics2D service instance (`api.services.get('physics')`).
 * @param entityIndex - Raw ECS slot index. **Not** a packed `EntityId` bigint.
 * @returns A {@link PhysicsEntitySnapshot} with nullable `position` and `velocity`.
 *
 * @example
 * ```ts
 * const snap = getBodySnapshot(physics, slot);
 * if (snap.position) renderer.moveTo(snap.position.x, snap.position.y);
 * ```
 *
 * Units:
 * - `position.x/y`: meters, `rotation`: radians
 * - `velocity.x/y`: meters/second
 */
export function getBodySnapshot(physics: Physics2DAPI, entityIndex: number): PhysicsEntitySnapshot {
  return {
    slot: entityIndex,
    position: physics.getPosition(entityIndex),
    velocity: physics.getLinearVelocity(entityIndex),
  };
}

/**
 * Check whether a sensor is currently active for a given entity slot.
 *
 * Wraps `physics.getSensorState()` with a boolean shorthand. Prefer this
 * helper over raw `getSensorState` when you only need the active/inactive flag.
 *
 * @param physics - Physics2D service instance.
 * @param entityIndex - Raw ECS slot index.
 * @param sensorId - Stable numeric sensor identifier (e.g. `SENSOR_ID_FOOT`).
 * @returns `true` when at least one contact is active for this sensor, `false` otherwise.
 *
 * @example
 * ```ts
 * if (isSensorActive(physics, slot, SENSOR_ID_FOOT)) allowJump();
 * ```
 */
export function isSensorActive(
  physics: Physics2DAPI,
  entityIndex: number,
  sensorId: number,
): boolean {
  return physics.getSensorState(entityIndex, sensorId).isActive;
}

/**
 * Compute the scalar speed of a physics body.
 *
 * Returns the Euclidean magnitude of the linear velocity vector.
 * Returns `0` when no body exists for this slot or velocity is unavailable.
 *
 * @param physics - Physics2D service instance.
 * @param entityIndex - Raw ECS slot index.
 * @returns Speed in meters/second (always ≥ 0), or `0` when unavailable.
 *
 * @example
 * ```ts
 * const speed = getSpeed(physics, slot);
 * if (speed > MAX_SPEED) clampVelocity(physics, slot, MAX_SPEED);
 * ```
 */
export function getSpeed(physics: Physics2DAPI, entityIndex: number): number {
  const vel = physics.getLinearVelocity(entityIndex);
  if (!vel) return 0;
  return Math.hypot(vel.x, vel.y);
}
