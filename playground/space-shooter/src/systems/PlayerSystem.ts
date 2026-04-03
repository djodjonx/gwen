import { defineSystem, onUpdate, useQuery, useEngine } from '@gwenjs/core';
import type { GwenEngine } from '@gwenjs/core';
import { useKeyboard, Keys } from '@gwenjs/input';
import {
  Position,
  Velocity,
  Size,
  Health,
  Shooter,
  PlayerTag,
  PlayerBulletTag,
} from '../components/index';
import { gameState } from '../gameState';

const PLAYER_SPEED = 200;
const CANVAS_W = 480;
const CANVAS_H = 640;
const HALF_W = 14;
const HALF_H = 14;

function spawnPlayerBullet(engine: GwenEngine, x: number, y: number): void {
  const id = engine.createEntity();
  engine.addComponent(id, Position, { x, y });
  engine.addComponent(id, Velocity, { x: 0, y: -450 });
  engine.addComponent(id, Size, { w: 4, h: 14 });
  engine.addComponent(id, PlayerBulletTag, { active: true });
}

export const PlayerSystem = defineSystem(function PlayerSystem() {
  const engine = useEngine();
  const kb = useKeyboard();
  const entities = useQuery([Position, Health, Shooter, PlayerTag]);

  // Spawn the single player entity during setup.
  const playerId = engine.createEntity();
  engine.addComponent(playerId, Position, { x: CANVAS_W / 2, y: CANVAS_H - 60 });
  engine.addComponent(playerId, Health, { hp: 3 });
  engine.addComponent(playerId, Shooter, { cooldown: 0.25, timer: 0 });
  engine.addComponent(playerId, Size, { w: HALF_W * 2, h: HALF_H * 2 });
  engine.addComponent(playerId, PlayerTag, { active: true });

  onUpdate((dt) => {
    if (gameState.gameOver) return;

    if (gameState.invincibleTimer > 0) {
      gameState.invincibleTimer = Math.max(0, gameState.invincibleTimer - dt);
    }

    for (const e of entities) {
      const pos = e.get(Position);
      const shooter = e.get(Shooter);
      if (!pos || !shooter) continue;

      // Resolve input direction.
      let vx = 0;
      let vy = 0;
      if (kb.isPressed(Keys.ArrowLeft) || kb.isPressed(Keys.A)) vx = -PLAYER_SPEED;
      if (kb.isPressed(Keys.ArrowRight) || kb.isPressed(Keys.D)) vx = PLAYER_SPEED;
      if (kb.isPressed(Keys.ArrowUp) || kb.isPressed(Keys.W)) vy = -PLAYER_SPEED;
      if (kb.isPressed(Keys.ArrowDown) || kb.isPressed(Keys.S)) vy = PLAYER_SPEED;

      // Clamp to canvas bounds.
      const nx = Math.max(HALF_W, Math.min(CANVAS_W - HALF_W, pos.x + vx * dt));
      const ny = Math.max(HALF_H, Math.min(CANVAS_H - HALF_H, pos.y + vy * dt));
      engine.addComponent(e.id, Position, { x: nx, y: ny });

      // Weapon cooldown and fire.
      let newTimer = Math.max(-1, shooter.timer - dt);
      let didShoot = false;
      if (kb.isPressed(Keys.Space) && newTimer <= 0) {
        newTimer = shooter.cooldown;
        didShoot = true;
      }
      engine.addComponent(e.id, Shooter, { cooldown: shooter.cooldown, timer: newTimer });

      if (didShoot) {
        spawnPlayerBullet(engine, nx, ny - HALF_H - 6);
      }
    }
  });
});
