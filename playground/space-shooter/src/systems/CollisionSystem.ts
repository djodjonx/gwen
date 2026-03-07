import { defineSystem } from '@gwen/engine-core';
import type { EntityId } from '@gwen/engine-core';
import { unpackEntityId } from '@gwen/engine-core';
import type { Physics2DAPI } from '@gwen/plugin-physics2d';
import { Tag, Score, Health } from '../components';

export const CollisionSystem = defineSystem('CollisionSystem', () => {
  let physics: Physics2DAPI | null = null;
  const slotToCurrentId = new Map<number, EntityId>();

  return {
    onInit(api) {
      physics = api.services.get('physics');
    },

    onUpdate(api) {
      if (!physics) return;

      const scoreList = api.query([Score.name]);
      if (scoreList.length === 0) return;
      const scoreId = scoreList[0];

      const playerId = api
        .query([Tag.name])
        .find((id) => api.getComponent(id, Tag)?.type === 'player');

      // Rebuild the slot-to-current-id map for accurate collision lookups
      slotToCurrentId.clear();
      const allEntities = api.query([Tag.name]);
      for (const id of allEntities) {
        const { index: slot } = unpackEntityId(id);
        slotToCurrentId.set(slot, id);
      }

      function getEntityFromSlot(slot: number): EntityId | null {
        const id = slotToCurrentId.get(slot);
        if (!id) return null;
        // Verify the entity still exists in ECS
        const tag = api.getComponent(id, Tag);
        return tag ? id : null;
      }

      function destroyWithPhysics(id: EntityId): void {
        const { index } = unpackEntityId(id);
        physics!.removeBody(index);
        api.destroyEntity(id);
      }

      // Guard against duplicate events for the same entity in one batch.
      const destroyed = new Set<EntityId>();

      for (const { slotA, slotB, started } of physics.getCollisionEvents()) {
        if (!started) continue;

        const entityA = getEntityFromSlot(slotA);
        const entityB = getEntityFromSlot(slotB);

        if (!entityA || !entityB) continue;
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
    },

    onDestroy() {
      physics = null;
      slotToCurrentId.clear();
    },
  };
});
