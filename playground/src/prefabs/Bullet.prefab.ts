import { definePrefab } from '@gwen/engine-core';
import { COMPONENTS as C, type Position, type Velocity, type Tag, type Collider } from '../components';

export const BulletPrefab = definePrefab({
  name: 'Bullet',
  create: (api, x: number, y: number, vx: number, vy: number, type: 'bullet' | 'enemy-bullet') => {
    const id = api.createEntity();
    api.addComponent<Position>(id, C.POSITION, { x, y });
    api.addComponent<Velocity>(id, C.VELOCITY, { vx, vy });
    api.addComponent<Tag>(id, C.TAG, { type });
    api.addComponent<Collider>(id, C.COLLIDER, { radius: type === 'bullet' ? 4 : 5 });
    return id;
  }
});
