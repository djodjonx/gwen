import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import { Tag, Score, Health } from '../components';

export const CollisionSystem = defineSystem('CollisionSystem', () => {
  let physics: Physics2DAPI | null = null;

  return {
    onInit(api) {
      physics = api.services.get('physics');

      // Subscribe to the enriched physics:collision hook.
      // EntityIds are already resolved by the plugin — no manual slot lookup needed.
      api.hooks.hook('physics:collision', (contacts) => {
        const scoreList = api.query([Score.name]);
        if (scoreList.length === 0) return;
        const scoreId = scoreList[0];

        const playerId = api
          .query([Tag.name])
          .find((id) => api.getComponent(id, Tag)?.type === 'player');

        function destroyWithPhysics(id: EntityId): void {
          const tag = api.getComponent(id, Tag);
          if (!tag) return; // already destroyed this frame
          const slot = Number(id & 0xffffffffn);
          physics!.removeBody(slot);
          api.destroyEntity(id);
        }

        // Guard against duplicate events for the same entity in one batch.
        const destroyed = new Set<EntityId>();

        for (const { entityA, entityB, started } of contacts) {
          if (!started) continue;
          if (destroyed.has(entityA) || destroyed.has(entityB)) continue;

          const tagA = api.getComponent(entityA, Tag)?.type;
          const tagB = api.getComponent(entityB, Tag)?.type;
          if (!tagA || !tagB) continue;

          // Player bullet hits enemy
          if ((tagA === 'bullet' && tagB === 'enemy') || (tagA === 'enemy' && tagB === 'bullet')) {
            const bulletId = tagA === 'bullet' ? entityA : entityB;
            const enemyId = tagA === 'enemy' ? entityA : entityB;
            destroyed.add(bulletId);
            destroyed.add(enemyId);
            destroyWithPhysics(bulletId);
            destroyWithPhysics(enemyId);
            const cur = api.getComponent(scoreId, Score);
            if (cur) api.addComponent(scoreId, Score, { ...cur, value: cur.value + 100 });
            continue;
          }

          // Enemy bullet hits player
          if (playerId === undefined) continue;
          if (entityA !== playerId && entityB !== playerId) continue;
          const bulletId = entityA === playerId ? entityB : entityA;
          if (api.getComponent(bulletId, Tag)?.type !== 'enemy-bullet') continue;

          destroyed.add(bulletId);
          destroyWithPhysics(bulletId);

          const cur = api.getComponent(scoreId, Score);
          if (cur) {
            const lives = cur.lives - 1;
            api.addComponent(scoreId, Score, { ...cur, lives });
            if (lives <= 0) api.scene?.load('MainMenu');
          }
          const health = api.getComponent(playerId, Health);
          if (health) api.addComponent(playerId, Health, { hp: Math.max(0, health.hp - 1) });
        }
      });
    },

    onDestroy() {
      physics = null;
    },
  };
});
