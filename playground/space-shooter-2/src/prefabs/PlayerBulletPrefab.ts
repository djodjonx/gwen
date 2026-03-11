import { definePrefab, UIComponent } from '@djodjonx/gwen-engine-core';
import type { EngineAPI } from '@djodjonx/gwen-engine-core';
import { Position, Velocity, Tag, Collider, Score } from '../components';
import { destroyWithPhysics, SCORE_PER_ENEMY } from './utils';

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
    api.addComponent(id, UIComponent, { uiName: 'PlayerBulletUI' });
    return id;
  },
});
