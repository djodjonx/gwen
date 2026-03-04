import { defineSystem } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import type { Physics2DAPI } from '@gwen/plugin-physics2d';
import { Tag, Score, Health } from '../components';

export const CollisionSystem = defineSystem('CollisionSystem', () => {
  let physics: Physics2DAPI | null = null;

  return {
    onInit(api: EngineAPI<GwenServices>) {
      physics = api.services.get('physics') as Physics2DAPI;
    },

    onUpdate(api: EngineAPI<GwenServices>) {
      if (!physics) return;

      const scoreList = api.query([Score.name]);
      if (scoreList.length === 0) return;
      const scoreId = scoreList[0];

      const playerId = api
        .query([Tag.name])
        .find((id) => api.getComponent(id, Tag)?.type === 'player');

      // Rapier returns raw slot indices — reconstruct packed EntityIds
      // so api.getComponent / destroyEntity work correctly.
      function packedId(slotIndex: number): number {
        return api.getEntityGeneration
          ? (api.getEntityGeneration(slotIndex) << 20) | (slotIndex & 0xfffff)
          : slotIndex; // fallback: assume generation=0
      }

      for (const { slotA, slotB, started } of physics.getCollisionEvents()) {
        if (!started) continue;

        const entityA = packedId(slotA);
        const entityB = packedId(slotB);

        const tagA = api.getComponent(entityA, Tag)?.type;
        const tagB = api.getComponent(entityB, Tag)?.type;
        if (!tagA || !tagB) continue;

        // Player bullet hits enemy
        if ((tagA === 'bullet' && tagB === 'enemy') || (tagA === 'enemy' && tagB === 'bullet')) {
          const bulletId = tagA === 'bullet' ? entityA : entityB;
          const enemyId = tagA === 'enemy' ? entityA : entityB;
          api.destroyEntity(bulletId);
          api.destroyEntity(enemyId);
          const cur = api.getComponent(scoreId, Score);
          if (cur) api.addComponent(scoreId, Score, { ...cur, value: cur.value + 100 });
          continue;
        }

        // Enemy bullet hits player
        if (playerId === undefined) continue;
        if (entityA !== playerId && entityB !== playerId) continue;
        const bulletId = entityA === playerId ? entityB : entityA;
        if (api.getComponent(bulletId, Tag)?.type !== 'enemy-bullet') continue;

        api.destroyEntity(bulletId);
        const cur = api.getComponent(scoreId, Score);
        if (cur) {
          const lives = cur.lives - 1;
          api.addComponent(scoreId, Score, { ...cur, lives });
          if (lives <= 0) api.scene?.load('MainMenu');
        }
        const health = api.getComponent(playerId, Health);
        if (health) {
          api.addComponent(playerId, Health, { hp: Math.max(0, health.hp - 1) });
        }
      }
    },

    onDestroy() {
      physics = null;
    },
  };
});
