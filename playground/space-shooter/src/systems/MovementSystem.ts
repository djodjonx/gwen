import { defineSystem, unpackEntityId, type EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import { Position, Velocity } from '../components';

export const MovementSystem = defineSystem('MovementSystem', () => {
  const toDestroy: EntityId[] = [];
  let physics: Physics2DAPI | null = null;

  return {
    onInit(api) {
      physics = api.services.get('physics');
    },

    onBeforeUpdate(api, dt) {
      toDestroy.length = 0;

      const movables = api.query([Position.name, Velocity.name]);
      for (const id of movables) {
        const pos = api.getComponent(id, Position);
        const vel = api.getComponent(id, Velocity);
        if (!pos || !vel) continue;

        api.addComponent(id, Position, {
          x: pos.x + vel.vx * dt,
          y: pos.y + vel.vy * dt,
        });

        if (pos.y < -80 || pos.y > 720 || pos.x < -80 || pos.x > 560) {
          toDestroy.push(id);
        }
      }
    },

    onUpdate(api) {
      for (const id of toDestroy) {
        if (physics) {
          const { index } = unpackEntityId(id);
          physics.removeBody(index);
        }
        api.destroyEntity(id);
      }
      toDestroy.length = 0;
    },

    onDestroy() {
      physics = null;
      toDestroy.length = 0;
    },
  };
});
