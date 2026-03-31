import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
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
          // id is already an EntityId — pass directly
          physics.setKinematicPosition(id, pos.x / pixelsPerMeter, pos.y / pixelsPerMeter);
        }
      },

      onDestroy() {
        physics = null;
      },
    };
  });
}

// ─── Platformer grounded helper ──────────────────────────────────────────────

/** Opaque sensor identifier for the foot sensor in platformer games. */
export const SENSOR_ID_FOOT = 0xf007;

export interface PlatformerGroundedSystemOptions {
  /** Sensor id used to track ground contacts. @default SENSOR_ID_FOOT */
  sensorId?: number;
}

/**
 * Create a tree-shakable helper that derives `isGrounded` from a foot sensor.
 *
 * Returns `isGrounded(entityId)` and `getSensorState(entityId)` utilities.
 */
export function createPlatformerGroundedSystem(
  options: PlatformerGroundedSystemOptions & { physics: Physics2DAPI },
) {
  const { physics } = options;
  const sensorId = options.sensorId ?? SENSOR_ID_FOOT;

  return {
    /** Returns `true` if the entity's foot sensor is currently touching ground. */
    isGrounded(entityId: EntityId): boolean {
      return physics.getSensorState(entityId, sensorId).isActive;
    },

    /** Returns the full sensor state for the entity. */
    getSensorState(entityId: EntityId): SensorState {
      return physics.getSensorState(entityId, sensorId);
    },
  };
}
