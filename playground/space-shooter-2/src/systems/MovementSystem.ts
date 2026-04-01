import { defineSystem, type EntityId } from '@gwenengine/core';
import { Position, Velocity } from '../components';

export const MovementSystem = defineSystem('MovementSystem', () => {
  const toDestroy: EntityId[] = [];

  return {
    onBeforeUpdate(api, dt) {
      toDestroy.length = 0;
      const renderer = api.services.get('renderer');
      const W = renderer.logicalWidth;
      const H = renderer.logicalHeight;

      const movables = api.query([Position.name, Velocity.name]);
      for (const id of movables) {
        const pos = api.getComponent(id, Position);
        const vel = api.getComponent(id, Velocity);
        if (!pos || !vel) continue;

        const nextX = pos.x + vel.vx * dt;
        const nextY = pos.y + vel.vy * dt;

        api.addComponent(id, Position, {
          x: nextX,
          y: nextY,
        });

        if (nextY < -80 || nextY > H + 80 || nextX < -80 || nextX > W + 80) {
          toDestroy.push(id);
        }
      }
    },

    onUpdate(api) {
      for (const id of toDestroy) {
        api.destroyEntity(id);
      }
      toDestroy.length = 0;
    },

    onDestroy() {
      toDestroy.length = 0;
    },
  };
});
