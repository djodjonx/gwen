import { defineSystem, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from './types';

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
