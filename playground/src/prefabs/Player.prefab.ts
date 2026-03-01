import { definePrefab } from '@gwen/engine-core';
import { COMPONENTS as C, type Position, type Velocity, type Tag, type ShootTimer, type Collider } from '../components';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api) => {
    // Canvas dimensions are 480x640
    const W = 480;
    const H = 640;

    const id = api.createEntity();
    api.addComponent(id, C.POSITION, { x: W / 2, y: H - 80 });
    api.addComponent(id, C.VELOCITY, { vx: 0, vy: 0 });
    api.addComponent(id, C.TAG, { type: 'player' });
    api.addComponent(id, C.SHOOT_TIMER, { elapsed: 0, cooldown: 0.25 });
    api.addComponent(id, C.COLLIDER, { radius: 14 });
    return id;
  }
});
