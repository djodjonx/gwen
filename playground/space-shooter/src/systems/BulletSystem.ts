import { defineSystem, onUpdate, useQuery, useEngine } from '@gwenjs/core';
import type { EntityId } from '@gwenjs/core';
import { Position, Velocity, Size, PlayerBulletTag, EnemyBulletTag } from '../components/index';

const CANVAS_W = 480;
const CANVAS_H = 640;
/** Extra margin before culling — prevents pop-in at spawn near edges. */
const CULL_MARGIN = 20;

export const BulletSystem = defineSystem(function BulletSystem() {
  const engine = useEngine();
  const playerBullets = useQuery([Position, Velocity, Size, PlayerBulletTag]);
  const enemyBullets = useQuery([Position, Velocity, Size, EnemyBulletTag]);

  onUpdate((dt) => {
    const toDestroy: EntityId[] = [];

    // ── Player bullets ────────────────────────────────────────────────────────
    for (const e of playerBullets) {
      const pos = e.get(Position);
      const vel = e.get(Velocity);
      if (!pos || !vel) continue;

      const nx = pos.x + vel.x * dt;
      const ny = pos.y + vel.y * dt;

      if (
        ny < -CULL_MARGIN ||
        ny > CANVAS_H + CULL_MARGIN ||
        nx < -CULL_MARGIN ||
        nx > CANVAS_W + CULL_MARGIN
      ) {
        toDestroy.push(e.id);
        continue;
      }

      engine.addComponent(e.id, Position, { x: nx, y: ny });
    }

    // ── Enemy bullets ─────────────────────────────────────────────────────────
    for (const e of enemyBullets) {
      const pos = e.get(Position);
      const vel = e.get(Velocity);
      if (!pos || !vel) continue;

      const nx = pos.x + vel.x * dt;
      const ny = pos.y + vel.y * dt;

      if (
        ny > CANVAS_H + CULL_MARGIN ||
        ny < -CULL_MARGIN ||
        nx < -CULL_MARGIN ||
        nx > CANVAS_W + CULL_MARGIN
      ) {
        toDestroy.push(e.id);
        continue;
      }

      engine.addComponent(e.id, Position, { x: nx, y: ny });
    }

    for (const id of toDestroy) engine.destroyEntity(id);
  });
});
