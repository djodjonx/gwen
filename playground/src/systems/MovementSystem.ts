import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Position, Velocity } from '../components';

export const MovementSystem = createPlugin({
  name: 'MovementSystem' as const,
  onUpdate(api: EngineAPI<GwenServices>, dt: number) {
    const movables = api.query([Position.name, Velocity.name]);
    for (const id of movables) {
      const pos = api.getComponent(id, Position);
      const vel = api.getComponent(id, Velocity);
      if (!pos || !vel) continue;

      api.addComponent(id, Position, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt,
      });

      // Hors écran → destroy
      if (pos.y < -80 || pos.y > 720 || pos.x < -80 || pos.x > 560) {
        api.destroyEntity(id);
      }
    }
  },
});
