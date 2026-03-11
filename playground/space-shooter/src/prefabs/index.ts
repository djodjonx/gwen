import { definePrefab, UIComponent, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { EngineAPI, EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import { Position, Velocity, Tag, ShootTimer, Health, Collider, Score } from '../components';

const SCORE_PER_ENEMY = 100;

function destroyWithPhysics(api: EngineAPI, id: EntityId): void {
  // Already destroyed this frame.
  if (!api.getComponent(id, Tag)) return;

  const physics = api.services.get('physics') as Physics2DAPI;
  const { index: slot } = unpackEntityId(id);
  physics.removeBody(slot);
  api.destroyEntity(id);
}

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

export const PlayerBulletPrefab = definePrefab({
  name: 'PlayerBullet',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      radius: 5,
      onCollision(self, other, contact, api) {
        if (!contact.started) return;
        if (api.getComponent(self, Tag)?.type !== 'bullet') return;
        if (api.getComponent(other, Tag)?.type !== 'enemy') return;

        destroyWithPhysics(api, self);
        destroyWithPhysics(api, other);

        const scoreId = api.query([Score.name])[0];
        if (scoreId === undefined) return;
        const cur = api.getComponent(scoreId, Score);
        if (cur) api.addComponent(scoreId, Score, { ...cur, value: cur.value + SCORE_PER_ENEMY });
      },
    },
  },
  create: (api: EngineAPI, x: number, y: number, vx: number, vy: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    api.addComponent(id, Tag, { type: 'bullet' });
    api.addComponent(id, Collider, { radius: 5 });
    api.addComponent(id, UIComponent, { uiName: 'BulletUI' });
    return id;
  },
});

export const EnemyBulletPrefab = definePrefab({
  name: 'EnemyBullet',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      radius: 4,
      onCollision(self, other, contact, api) {
        if (!contact.started) return;
        if (api.getComponent(self, Tag)?.type !== 'enemy-bullet') return;
        if (api.getComponent(other, Tag)?.type !== 'player') return;

        destroyWithPhysics(api, self);

        const scoreId = api.query([Score.name])[0];
        if (scoreId !== undefined) {
          const cur = api.getComponent(scoreId, Score);
          if (cur) {
            const lives = cur.lives - 1;
            api.addComponent(scoreId, Score, { ...cur, lives });
            if (lives <= 0) api.scene?.load('MainMenu');
          }
        }

        const health = api.getComponent(other, Health);
        if (health) api.addComponent(other, Health, { hp: Math.max(0, health.hp - 1) });
      },
    },
  },
  create: (api: EngineAPI, x: number, y: number, vx: number, vy: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    api.addComponent(id, Tag, { type: 'enemy-bullet' });
    api.addComponent(id, Collider, { radius: 4 });
    api.addComponent(id, UIComponent, { uiName: 'BulletUI' });
    return id;
  },
});

/** @deprecated Utiliser PlayerBulletPrefab ou EnemyBulletPrefab */
export const BulletPrefab = PlayerBulletPrefab;
