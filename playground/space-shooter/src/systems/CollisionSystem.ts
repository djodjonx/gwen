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

      // Reconstruct packed EntityId from a raw Rapier slot index.
      // MUST be called BEFORE any destroyEntity() — destroyEntity increments
      // the generation immediately, making packedId return a stale/wrong ID.
      function packedId(slotIndex: number): number {
        return (api.getEntityGeneration(slotIndex) << 20) | (slotIndex & 0xfffff);
      }

      // Helper: destroy entity in both ECS and Rapier immediately.
      // Without the physics.removeBody call here, Rapier keeps the body alive
      // for one more frame and can fire duplicate collision events.
      function destroyWithPhysics(id: number): void {
        const slot = id & 0xfffff;
        physics!.removeBody(slot);
        api.destroyEntity(id);
      }

      // Guard against processing the same entity twice in one event batch.
      // Rapier can emit duplicate started=true events for fast-moving bodies.
      const destroyed = new Set<number>();

      for (const { slotA, slotB, started } of physics.getCollisionEvents()) {
        if (!started) continue;

        // Capture packed IDs FIRST — before any destroyEntity call that would
        // increment the generation and make subsequent packedId() calls wrong.
        const entityA = packedId(slotA);
        const entityB = packedId(slotB);

        // Skip if either entity was already destroyed in this batch
        if (destroyed.has(entityA) || destroyed.has(entityB)) continue;

        // Validate both entities are still alive
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
