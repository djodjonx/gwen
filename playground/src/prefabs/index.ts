import { definePrefab } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Position, Velocity, Tag, Collider, ShootTimer, Health } from '../components';

// Les prefabs utilisent EngineAPI sans paramètre de services —
// ils n'ont besoin que des opérations ECS, pas des services plugins.
export const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api: EngineAPI) => {
    const id = api.createEntity();
    api.addComponent(id, Position,   { x: 240, y: 560 });
    api.addComponent(id, Velocity,   { vx: 0, vy: 0 });
    api.addComponent(id, Tag,        { type: 'player' });
    api.addComponent(id, Collider,   { radius: 14 });
    api.addComponent(id, Health,     { hp: 3 });
    api.addComponent(id, ShootTimer, { elapsed: 0, cooldown: 0.22 });
    return id;
  },
});

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api: EngineAPI, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position,   { x, y });
    api.addComponent(id, Velocity,   { vx: 0, vy: 80 });
    api.addComponent(id, Tag,        { type: 'enemy' });
    api.addComponent(id, Collider,   { radius: 16 });
    api.addComponent(id, Health,     { hp: 1 });
    api.addComponent(id, ShootTimer, { elapsed: Math.random() * 2, cooldown: 2.0 + Math.random() });
    return id;
  },
});

export const BulletPrefab = definePrefab({
  name: 'Bullet',
  create: (api: EngineAPI, x: number, y: number, vx: number, vy: number, tagType: string) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    api.addComponent(id, Tag,      { type: tagType as any });
    api.addComponent(id, Collider, { radius: tagType === 'bullet' ? 5 : 4 });
    return id;
  },
});
