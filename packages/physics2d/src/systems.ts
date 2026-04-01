import type { GwenEngine, EntityId } from '@gwenengine/core';
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
 * Create a reusable plugin that syncs ECS position -> Rapier kinematic bodies.
 *
 * Bodies/colliders lifecycle remains handled by prefab `extensions.physics`
 * in the Physics2D plugin.
 *
 * @note ECS query integration pending RFC-006. The `onBeforeUpdate` phase
 * fires but entity iteration requires a live query once the ECS composables
 * are wired into the V2 engine.
 */
export function createPhysicsKinematicSyncSystem(options: PhysicsKinematicSyncSystemOptions = {}) {
  const pixelsPerMeter = options.pixelsPerMeter ?? DEFAULT_PIXELS_PER_METER;
  const _positionComponent = options.positionComponent ?? DEFAULT_POSITION_COMPONENT;

  let _physics: Physics2DAPI | null = null;

  return {
    name: 'PhysicsKinematicSyncSystem',

    setup(engine: GwenEngine) {
      _physics = engine.inject(
        'physics2d' as keyof import('@gwenengine/core').GwenProvides,
      ) as unknown as Physics2DAPI;
    },

    onBeforeUpdate(_dt: number) {
      if (!_physics) return;
      // TODO(RFC-006): iterate entities using engine.createLiveQuery([positionComponent])
      // and call _physics.setKinematicPosition(id, pos.x / pixelsPerMeter, pos.y / pixelsPerMeter)
    },

    teardown() {
      _physics = null;
    },
  };
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
