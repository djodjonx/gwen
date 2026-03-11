import { definePrefab, UIComponent } from '@djodjonx/gwen-engine-core';
import type { EngineAPI } from '@djodjonx/gwen-engine-core';
import { Position, Velocity, Tag, ShootTimer, Health, Collider } from '../components';

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      radius: 16,
    },
  },
  create: (api: EngineAPI, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx: 0, vy: 80 });
    api.addComponent(id, Tag, { type: 'enemy' });
    api.addComponent(id, Collider, { radius: 16 });
    api.addComponent(id, Health, { hp: 1 });
    api.addComponent(id, ShootTimer, {
      elapsed: Math.random() * 2,
      cooldown: 2.0 + Math.random(),
    });
    api.addComponent(id, UIComponent, { uiName: 'EnemyUI' });
    return id;
  },
});
