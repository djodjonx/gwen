import { definePrefab, UIComponent } from '@gwenjs/core';
import type { EngineAPI } from '@gwenjs/core';
import { Position, Velocity, Tag, ShootTimer, Health, Collider } from '../components';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      radius: 14,
    },
  },
  create: (api: EngineAPI) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x: 240, y: 560 });
    api.addComponent(id, Velocity, { vx: 0, vy: 0 });
    api.addComponent(id, Tag, { type: 'player' });
    api.addComponent(id, Collider, { radius: 14 });
    api.addComponent(id, Health, { hp: 3 });
    api.addComponent(id, ShootTimer, { elapsed: 0, cooldown: 0.22 });
    api.addComponent(id, UIComponent, { uiName: 'PlayerUI' });
    return id;
  },
});
