import { defineSystem, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import { Position, Collider, Tag } from '../components';

const PIXELS_PER_METER = 50;

export const PhysicsBindingSystem = defineSystem('PhysicsBindingSystem', () => {
  let physics: Physics2DAPI | null = null;

  return {
    onInit(api) {
      physics = api.services.get('physics') as Physics2DAPI;
    },

    onBeforeUpdate(api) {
      if (!physics) return;

      // Bodies are created by Physics2D prefab extensions.
      // This system only keeps Rapier kinematic positions in sync with ECS.
      const entities = api.query([Position.name, Collider.name, Tag.name]);
      for (const id of entities) {
        const pos = api.getComponent(id, Position);
        if (!pos) continue;

        const { index: slot } = unpackEntityId(id);
        physics.setKinematicPosition(slot, pos.x / PIXELS_PER_METER, pos.y / PIXELS_PER_METER);
      }
    },

    onDestroy() {
      physics = null;
    },
  };
});
