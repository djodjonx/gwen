import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI, SceneManager } from '@gwen/engine-core';
import type { GwenServices } from '../../gwen.config';
import type { KeyboardInput } from '@gwen/plugin-input';
import { Tag, Position, Velocity, ShootTimer } from '../components';

const SPEED = 260;
const W = 480, H = 640; // dimensions logiques du canvas

export function makePlayerSystem(scenes: SceneManager) {
  let keyboard: KeyboardInput | null = null;

  return createPlugin({
    name: 'PlayerSystem' as const,

    onInit(api: EngineAPI<GwenServices>) {
      keyboard = api.services.get('keyboard');
    },

    onUpdate(api: EngineAPI<GwenServices>, dt: number) {
      if (!keyboard) return;

      const players = api.query([Tag.name, Position.name, Velocity.name, ShootTimer.name]);
      for (const id of players) {
        const tag = api.getComponent(id, Tag);
        if (tag?.type !== 'player') continue;

        const pos = api.getComponent(id, Position);
        const timer = api.getComponent(id, ShootTimer);
        if (!pos || !timer) continue;

        // Mouvement
        let vx = 0, vy = 0;
        if (keyboard.isPressed('ArrowLeft')  || keyboard.isPressed('KeyA')) vx = -SPEED;
        if (keyboard.isPressed('ArrowRight') || keyboard.isPressed('KeyD')) vx =  SPEED;
        if (keyboard.isPressed('ArrowUp')    || keyboard.isPressed('KeyW')) vy = -SPEED;
        if (keyboard.isPressed('ArrowDown')  || keyboard.isPressed('KeyS')) vy =  SPEED;

        // Clamp dans le canvas
        const nx = Math.max(20, Math.min(W - 20, pos.x + vx * dt));
        const ny = Math.max(20, Math.min(H - 20, pos.y + vy * dt));
        api.addComponent(id, Position,  { x: nx, y: ny });
        api.addComponent(id, Velocity,  { vx, vy });

        // Tir
        const elapsed = timer.elapsed + dt;
        if ((keyboard.isPressed('Space') || keyboard.isPressed('KeyZ')) && elapsed >= timer.cooldown) {
          api.prefabs.instantiate('Bullet', pos.x, pos.y - 20, 0, -500, 'bullet');
          api.addComponent(id, ShootTimer, { ...timer, elapsed: 0 });
        } else {
          api.addComponent(id, ShootTimer, { ...timer, elapsed });
        }
      }
    },
  });
}

