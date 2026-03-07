import { defineSystem } from '@gwen/engine-core';
import { Tag, Position, ShootTimer } from '../components';

export const AiSystem = defineSystem({
  name: 'AiSystem' as const,
  onUpdate(api, dt) {
    const enemies = api.query([Tag.name, Position.name, ShootTimer.name]);
    for (const id of enemies) {
      const tag = api.getComponent(id, Tag);
      if (tag?.type !== 'enemy') continue;

      const timer = api.getComponent(id, ShootTimer);
      if (!timer) continue;

      const elapsed = timer.elapsed + dt;
      if (elapsed >= timer.cooldown) {
        const pos = api.getComponent(id, Position);
        if (!pos) continue;
        api.prefabs.instantiate('Bullet', pos.x, pos.y + 18, 0, 300, 'enemy-bullet');
        api.addComponent(id, ShootTimer, { ...timer, elapsed: 0 });
      } else {
        api.addComponent(id, ShootTimer, { ...timer, elapsed });
      }
    }
  },
});
