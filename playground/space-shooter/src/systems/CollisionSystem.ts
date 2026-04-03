import { defineSystem, onUpdate, useQuery, useEngine } from '@gwenjs/core';
import type { EntityId } from '@gwenjs/core';
import {
  Position,
  Size,
  Health,
  PlayerTag,
  EnemyTag,
  PlayerBulletTag,
  EnemyBulletTag,
} from '../components/index';
import { gameState } from '../gameState';

/** Returns true when two centred AABB rectangles overlap. */
function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  const hw1 = aw / 2;
  const hh1 = ah / 2;
  const hw2 = bw / 2;
  const hh2 = bh / 2;
  return ax - hw1 < bx + hw2 && ax + hw1 > bx - hw2 && ay - hh1 < by + hh2 && ay + hh1 > by - hh2;
}

export const CollisionSystem = defineSystem(function CollisionSystem() {
  const engine = useEngine();

  const playerBullets = useQuery([Position, Size, PlayerBulletTag]);
  const enemyBullets = useQuery([Position, Size, EnemyBulletTag]);
  const enemies = useQuery([Position, Size, Health, EnemyTag]);
  const players = useQuery([Position, Size, Health, PlayerTag]);

  onUpdate(() => {
    if (gameState.gameOver) return;

    const bulletsToDestroy = new Set<EntityId>();
    const enemiesToDestroy = new Set<EntityId>();

    // ── Player bullets vs enemies ─────────────────────────────────────────────
    for (const b of playerBullets) {
      if (bulletsToDestroy.has(b.id)) continue;
      const bPos = b.get(Position);
      const bSize = b.get(Size);
      if (!bPos || !bSize) continue;

      for (const en of enemies) {
        if (enemiesToDestroy.has(en.id)) continue;
        const ePos = en.get(Position);
        const eSize = en.get(Size);
        const eHp = en.get(Health);
        if (!ePos || !eSize || !eHp) continue;

        if (overlaps(bPos.x, bPos.y, bSize.w, bSize.h, ePos.x, ePos.y, eSize.w, eSize.h)) {
          bulletsToDestroy.add(b.id);
          const newHp = eHp.hp - 1;
          if (newHp <= 0) {
            enemiesToDestroy.add(en.id);
            gameState.score++;
          } else {
            engine.addComponent(en.id, Health, { hp: newHp });
          }
          break; // bullet is consumed — stop checking this bullet against other enemies
        }
      }
    }

    // ── Enemy bullets vs player ───────────────────────────────────────────────
    const enemyBulletsToDestroy = new Set<EntityId>();

    for (const b of enemyBullets) {
      if (enemyBulletsToDestroy.has(b.id)) continue;
      const bPos = b.get(Position);
      const bSize = b.get(Size);
      if (!bPos || !bSize) continue;

      for (const p of players) {
        if (gameState.invincibleTimer > 0) break; // player is invincible
        const pPos = p.get(Position);
        const pSize = p.get(Size);
        const pHp = p.get(Health);
        if (!pPos || !pSize || !pHp) continue;

        if (overlaps(bPos.x, bPos.y, bSize.w, bSize.h, pPos.x, pPos.y, pSize.w, pSize.h)) {
          enemyBulletsToDestroy.add(b.id);
          const newHp = pHp.hp - 1;

          if (newHp <= 0) {
            gameState.lives--;
            if (gameState.lives <= 0) {
              gameState.gameOver = true;
            } else {
              // Respawn player in place with full HP and temporary invincibility.
              engine.addComponent(p.id, Health, { hp: 3 });
              engine.addComponent(p.id, Position, { x: 240, y: 580 });
              gameState.invincibleTimer = 3.0;
            }
          } else {
            engine.addComponent(p.id, Health, { hp: newHp });
            gameState.invincibleTimer = 2.0;
          }
          break;
        }
      }
    }

    for (const id of bulletsToDestroy) engine.destroyEntity(id);
    for (const id of enemiesToDestroy) engine.destroyEntity(id);
    for (const id of enemyBulletsToDestroy) engine.destroyEntity(id);
  });
});
