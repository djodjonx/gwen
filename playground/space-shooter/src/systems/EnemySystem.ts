import { defineSystem, onUpdate, useQuery, useEngine } from '@gwenjs/core';
import type { GwenEngine, EntityId } from '@gwenjs/core';
import {
  Position,
  Velocity,
  Size,
  Health,
  Shooter,
  EnemyTag,
  EnemyBulletTag,
} from '../components/index';
import { gameState } from '../gameState';

const CANVAS_W = 480;
const CANVAS_H = 640;

/** Slowest speed at which enemies enter the field (px/s). */
const SPEED_MIN = 55;
/** Additional speed range applied randomly to each enemy (px/s). */
const SPEED_RANGE = 85;
/** Longest gap between spawns at score 0. */
const SPAWN_INTERVAL_BASE = 2.2;
/** Minimum gap between spawns regardless of score. */
const SPAWN_INTERVAL_MIN = 0.45;

function spawnEnemy(engine: GwenEngine, overrideY?: number): void {
  const x = 36 + Math.random() * (CANVAS_W - 72);
  const y = overrideY ?? -20;
  const speed = SPEED_MIN + Math.random() * SPEED_RANGE;
  const hp = Math.random() < 0.25 ? 3 : 1;
  const shootCooldown = 1.4 + Math.random() * 2.0;
  const id = engine.createEntity();
  engine.addComponent(id, Position, { x, y });
  engine.addComponent(id, Size, { w: 28, h: 28 });
  engine.addComponent(id, Health, { hp });
  engine.addComponent(id, Shooter, {
    cooldown: shootCooldown,
    timer: Math.random() * shootCooldown,
  });
  engine.addComponent(id, EnemyTag, { speed });
}

function spawnEnemyBullet(engine: GwenEngine, x: number, y: number): void {
  const drift = (Math.random() - 0.5) * 40;
  const id = engine.createEntity();
  engine.addComponent(id, Position, { x, y });
  engine.addComponent(id, Velocity, { x: drift, y: 210 });
  engine.addComponent(id, Size, { w: 5, h: 12 });
  engine.addComponent(id, EnemyBulletTag, { active: true });
}

export const EnemySystem = defineSystem(function EnemySystem() {
  const engine = useEngine();
  const enemies = useQuery([Position, Size, Health, Shooter, EnemyTag]);

  // Spawn 5 staggered enemies immediately so the field isn't empty at game start.
  for (let i = 0; i < 5; i++) {
    spawnEnemy(engine, -30 - i * 20);
  }

  onUpdate((dt) => {
    if (gameState.gameOver) return;

    // Dynamic spawn interval — gets tighter as score increases.
    const interval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - gameState.score * 0.015);
    gameState.spawnTimer += dt;
    if (gameState.spawnTimer >= interval) {
      gameState.spawnTimer = 0;
      spawnEnemy(engine);
      if (gameState.score > 10) spawnEnemy(engine);
    }

    // Collect entities to destroy after iteration — never mutate during iteration.
    const toDestroy: EntityId[] = [];

    for (const e of enemies) {
      const pos = e.get(Position);
      const tag = e.get(EnemyTag);
      const shooter = e.get(Shooter);
      if (!pos || !tag || !shooter) continue;

      const ny = pos.y + tag.speed * dt;
      engine.addComponent(e.id, Position, { x: pos.x, y: ny });

      if (ny > CANVAS_H + 32) {
        toDestroy.push(e.id);
        continue;
      }

      // Weapon cooldown and fire.
      const newTimer = shooter.timer - dt;
      if (newTimer <= 0) {
        engine.addComponent(e.id, Shooter, {
          cooldown: shooter.cooldown,
          timer: shooter.cooldown,
        });
        spawnEnemyBullet(engine, pos.x, ny + 16);
      } else {
        engine.addComponent(e.id, Shooter, { cooldown: shooter.cooldown, timer: newTimer });
      }
    }

    for (const id of toDestroy) engine.destroyEntity(id);
  });
});
