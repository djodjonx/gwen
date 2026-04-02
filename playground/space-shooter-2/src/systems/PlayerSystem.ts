import { defineSystem } from '@gwenjs/core';
import { Tag, Position, Velocity, ShootTimer } from '../components';

const SPEED = 260;

export const PlayerSystem = defineSystem({
  name: 'PlayerSystem' as const,

  onUpdate(api, dt) {
    const keyboard = api.services.get('keyboard');
    const renderer = api.services.get('renderer');
    const W = renderer.logicalWidth;
    const H = renderer.logicalHeight;

    const players = api.query([Tag.name, Position.name, Velocity.name, ShootTimer.name]);
    for (const id of players) {
      const tag = api.getComponent(id, Tag);
      if (tag?.type !== 'player') continue;

      const pos = api.getComponent(id, Position);
      const timer = api.getComponent(id, ShootTimer);
      if (!pos || !timer) continue;

      // Movement
      let vx = 0;
      let vy = 0;
      const upPressed = keyboard.isPressed('ArrowUp') || keyboard.isPressed('KeyW');
      const downPressed = keyboard.isPressed('ArrowDown') || keyboard.isPressed('KeyS');

      if (keyboard.isPressed('ArrowLeft') || keyboard.isPressed('KeyA')) vx = -SPEED;
      if (keyboard.isPressed('ArrowRight') || keyboard.isPressed('KeyD')) vx = SPEED;
      if (upPressed) vy = -SPEED;
      if (downPressed) vy = SPEED;

      // Clamp inside canvas
      const nx = Math.max(20, Math.min(W - 20, pos.x + vx * dt));
      const ny = Math.max(20, Math.min(H - 20, pos.y + vy * dt));
      api.addComponent(id, Position, { x: nx, y: ny });
      api.addComponent(id, Velocity, { vx, vy });

      // Shooting
      const elapsed = timer.elapsed + dt;
      if (
        (keyboard.isPressed('Space') || keyboard.isPressed('KeyZ')) &&
        elapsed >= timer.cooldown
      ) {
        api.prefabs.instantiate('PlayerBullet', pos.x, pos.y - 20, 0, -500);
        api.addComponent(id, ShootTimer, { ...timer, elapsed: 0 });
      } else {
        api.addComponent(id, ShootTimer, { ...timer, elapsed });
      }
    }
  },
});
