import { definePrefab, UIComponent } from '@gwenengine/core';
import type { EngineAPI } from '@gwenengine/core';
import { Position, Velocity, Tag, Collider, Score, Health } from '../components';
import { destroyWithPhysics } from './utils';

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
