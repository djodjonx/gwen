import { definePrefab, UIComponent } from '@gwenjs/core';
import type { EngineAPI } from '@gwenjs/core';
import { Position, Velocity, Tag, ShootTimer, Health, Collider, Score } from '../components';
import { destroyWithPhysics } from './utils';

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      radius: 16,
      onCollision(self, other, contact, api) {
        if (!contact.started) return;
        if (api.getComponent(self, Tag)?.type !== 'enemy') return;
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
