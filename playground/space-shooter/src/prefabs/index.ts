import { definePrefab, UIComponent } from '@djodjonx/gwen-engine-core';
import type { EngineAPI } from '@djodjonx/gwen-engine-core';
import { Position, Velocity, Tag, ShootTimer, Health } from '../components';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  extensions: {
    physics: { bodyType: 'kinematic', radius: 14 },
  },
  create: (api: EngineAPI) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x: 240, y: 560 });
    api.addComponent(id, Velocity, { vx: 0, vy: 0 });
    api.addComponent(id, Tag, { type: 'player' });
    api.addComponent(id, Health, { hp: 3 });
    api.addComponent(id, ShootTimer, { elapsed: 0, cooldown: 0.22 });
    api.addComponent(id, UIComponent, { uiName: 'PlayerUI' });
    return id;
  },
});

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  extensions: {
    physics: { bodyType: 'kinematic', radius: 16 },
  },
  create: (api: EngineAPI, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx: 0, vy: 80 });
    api.addComponent(id, Tag, { type: 'enemy' });
    api.addComponent(id, Health, { hp: 1 });
    api.addComponent(id, ShootTimer, {
      elapsed: Math.random() * 2,
      cooldown: 2.0 + Math.random(),
    });
    api.addComponent(id, UIComponent, { uiName: 'EnemyUI' });
    return id;
  },
});

export const PlayerBulletPrefab = definePrefab({
  name: 'PlayerBullet',
  extensions: {
    physics: { bodyType: 'kinematic', radius: 5 },
  },
  create: (api: EngineAPI, x: number, y: number, vx: number, vy: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    api.addComponent(id, Tag, { type: 'bullet' });
    api.addComponent(id, UIComponent, { uiName: 'BulletUI' });
    return id;
  },
});

export const EnemyBulletPrefab = definePrefab({
  name: 'EnemyBullet',
  extensions: {
    physics: { bodyType: 'kinematic', radius: 4 },
  },
  create: (api: EngineAPI, x: number, y: number, vx: number, vy: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    api.addComponent(id, Tag, { type: 'enemy-bullet' });
    api.addComponent(id, UIComponent, { uiName: 'BulletUI' });
    return id;
  },
});

/** @deprecated Utiliser PlayerBulletPrefab ou EnemyBulletPrefab */
export const BulletPrefab = PlayerBulletPrefab;
