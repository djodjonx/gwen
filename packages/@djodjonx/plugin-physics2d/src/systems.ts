import { defineSystem, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI, SensorState } from './types';

const DEFAULT_PIXELS_PER_METER = 50;
const DEFAULT_POSITION_COMPONENT = 'position';

export interface PhysicsKinematicSyncSystemOptions {
  /**
   * Conversion ratio from pixels (ECS) to meters (Rapier).
   * @default 50
   */
  pixelsPerMeter?: number;
  /**
   * ECS component name containing `{ x, y }` coordinates.
   * @default 'position'
   */
  positionComponent?: string;
}

/**
 * Create a reusable system that syncs ECS position -> Rapier kinematic bodies.
 *
 * Bodies/colliders lifecycle remains handled by prefab `extensions.physics`
 * in the Physics2D plugin.
 */
export function createPhysicsKinematicSyncSystem(options: PhysicsKinematicSyncSystemOptions = {}) {
  const pixelsPerMeter = options.pixelsPerMeter ?? DEFAULT_PIXELS_PER_METER;
  const positionComponent = options.positionComponent ?? DEFAULT_POSITION_COMPONENT;

  return defineSystem('PhysicsKinematicSyncSystem', () => {
    let physics: Physics2DAPI | null = null;

    return {
      onInit(api) {
        physics = api.services.get('physics') as Physics2DAPI;
      },

      onBeforeUpdate(api) {
        if (!physics) return;

        const entities = api.query([positionComponent]);
        for (const id of entities) {
          const pos = api.getComponent<{ x: number; y: number }>(id, positionComponent);
          if (!pos) continue;

          const { index: slot } = unpackEntityId(id);
          physics.setKinematicPosition(slot, pos.x / pixelsPerMeter, pos.y / pixelsPerMeter);
        }
      },

      onDestroy() {
        physics = null;
      },
    };
  });
}

// ─── Platformer grounded helper (Sprint 4) ───────────────────────────────────

/**
 * Opaque sensor identifier for the foot sensor in platformer games.
 * Use this constant as `sensorId` in `getSensorState(slot, SENSOR_ID_FOOT)`.
 *
 * @example
 * ```ts
 * const foot = physics.getSensorState(slot, SENSOR_ID_FOOT);
 * if (foot.isActive) canJump = true;
 * ```
 */
export const SENSOR_ID_FOOT = 0xf007; // arbitrary stable constant

export interface PlatformerGroundedSystemOptions {
  /**
   * Sensor id used to track ground contacts.
   * Must match the `sensorId` used when calling `physics.updateSensorState`.
   * @default SENSOR_ID_FOOT
   */
  sensorId?: number;
}

/**
 * Create a tree-shakable helper that derives `isGrounded` from a foot sensor.
 *
 * Returns a `isGrounded(slot)` function to call in your own update loop.
 * No ECS writes are performed — the game owns its state.
 *
 * ## Usage
 * ```ts
 * const { isGrounded } = createPlatformerGroundedSystem({ physics });
 *
 * // In your update loop:
 * if (isGrounded(playerSlot)) {
 *   physics.applyImpulse(playerSlot, 0, JUMP_FORCE);
 * }
 * ```
 *
 * ## Performance notes
 * - `getSensorState` is O(1) — a direct HashMap lookup on the Rust side.
 * - No event subscription is needed; this helper reads state, not events.
 * - Zero allocations in the hot path.
 */
export function createPlatformerGroundedSystem(
  options: PlatformerGroundedSystemOptions & { physics: Physics2DAPI },
) {
  const { physics } = options;
  const sensorId = options.sensorId ?? SENSOR_ID_FOOT;

  return {
    /**
     * Returns `true` if the entity's foot sensor is currently touching ground.
     * @param slot Raw ECS slot index (not a packed EntityId).
     */
    isGrounded(slot: number): boolean {
      return physics.getSensorState(slot, sensorId).isActive;
    },

    /**
     * Returns the full sensor state for the entity.
     * Useful when you need contactCount, not just the boolean.
     */
    getSensorState(slot: number): SensorState {
      return physics.getSensorState(slot, sensorId);
    },
  };
}
