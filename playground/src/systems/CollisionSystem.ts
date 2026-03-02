import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Tag, Position, Collider, Score, Health } from '../components';

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

export const CollisionSystem = createPlugin({
  name: 'CollisionSystem' as const,

  onUpdate(api: EngineAPI<GwenServices>) {
    const scoreList = api.query([Score.name]);
    if (scoreList.length === 0) return;
    const scoreId = scoreList[0];
    const score = api.getComponent(scoreId, Score);
    if (!score) return;

    const entities = api.query([Tag.name, Position.name, Collider.name]);
    const playerId = api.query([Tag.name]).find(id => api.getComponent(id, Tag)?.type === 'player');

    // Balles joueur vs ennemis
    for (const bid of entities) {
      if (api.getComponent(bid, Tag)?.type !== 'bullet') continue;
      const bp = api.getComponent(bid, Position);
      const bc = api.getComponent(bid, Collider);
      if (!bp || !bc) continue;

      for (const eid of entities) {
        if (api.getComponent(eid, Tag)?.type !== 'enemy') continue;
        const ep = api.getComponent(eid, Position);
        const ec = api.getComponent(eid, Collider);
        if (!ep || !ec) continue;

        if (dist(bp.x, bp.y, ep.x, ep.y) < bc.radius + ec.radius) {
          api.destroyEntity(bid);
          api.destroyEntity(eid);
          api.addComponent(scoreId, Score, { ...score, value: score.value + 100 });
          break;
        }
      }
    }

    // Balles ennemies vs joueur
    if (playerId === undefined) return;
    const pp = api.getComponent(playerId, Position);
    const pc = api.getComponent(playerId, Collider);
    if (!pp || !pc) return;

    for (const bid of entities) {
      if (api.getComponent(bid, Tag)?.type !== 'enemy-bullet') continue;
      const bp = api.getComponent(bid, Position);
      const bc = api.getComponent(bid, Collider);
      if (!bp || !bc) continue;

      if (dist(bp.x, bp.y, pp.x, pp.y) < bc.radius + pc.radius) {
        api.destroyEntity(bid);
        const cur = api.getComponent(scoreId, Score);
        if (!cur) continue;
        const lives = cur.lives - 1;
        api.addComponent(scoreId, Score, { ...cur, lives });

        const health = api.getComponent(playerId, Health);
        if (health) {
          api.addComponent(playerId, Health, { hp: Math.max(0, health.hp - 1) });
        }

        if (lives <= 0) api.scene?.load('MainMenu');
      }
    }
  },
});
