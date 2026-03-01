import { definePrefab } from '@gwen/engine-core';
import { COMPONENTS as C, type Position, type Velocity, type Tag, type ShootTimer, type Collider, type Health } from '../components';

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, C.POSITION, { x, y });
    api.addComponent(id, C.VELOCITY, { vx: 0, vy: 80 });
    api.addComponent(id, C.TAG, { type: 'enemy' });
    api.addComponent(id, C.COLLIDER, { radius: 14 });
    api.addComponent(id, C.HEALTH, { current: 1, max: 1 });
    api.addComponent(id, C.SHOOT_TIMER, {
      elapsed: Math.random() * 2,
      cooldown: 2 + Math.random() * 2,
    });
    return id;
  }
});
