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

      // Use the snapshot built by PhysicsBindingSystem at registration time.
      // This is reliable even if a slot was recycled between onBeforeUpdate
      // and onUpdate (which would make api.getEntityGeneration() return the
      // wrong generation for a slot whose entity was just destroyed).
      const slotToPackedId: Map<number, number> =
        ((physics as unknown as Record<string, unknown>)['_slotToPackedId'] as Map<
          number,
          number
        >) ?? new Map();

      function packedId(slotIndex: number): number | undefined {
        return slotToPackedId.get(slotIndex);
      }

      function destroyWithPhysics(id: number): void {
        const slot = id & 0xfffff;
        physics!.removeBody(slot);
        slotToPackedId.delete(slot); // keep snapshot in sync
        api.destroyEntity(id);
      }

      const destroyed = new Set<number>();

      for (const { slotA, slotB, started } of physics.getCollisionEvents()) {
        if (!started) continue;

        const entityA = packedId(slotA);
        const entityB = packedId(slotB);

        // If either slot is not in the snapshot it was never registered or
        // was already cleaned up — skip silently.
        if (entityA === undefined || entityB === undefined) continue;

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
