import { type EngineAPI } from '@gwen/engine-core';
import type { GwenPlugin } from '@gwen/engine-core';
import type { GwenServices } from '../../engine.config';
import { COMPONENTS as C } from '../components';

export class MovementSystem implements GwenPlugin<'MovementSystem'> {
  readonly name = 'MovementSystem' as const;

  onUpdate(api: EngineAPI<GwenServices>, dt: number): void {
    const movables = api.query([C.POSITION.name, C.VELOCITY.name]);
    for (const id of movables) {
      const pos = api.getComponent(id, C.POSITION)!;
      const vel = api.getComponent(id, C.VELOCITY)!;
      api.addComponent(id, C.POSITION, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt,
      });

      // Cleanup entities that moved out of bounds
      if (pos.y < -60 || pos.y > 640 + 60 || pos.x < -60 || pos.x > 480 + 60) {
        api.destroyEntity(id);
      }
    }
  }
}
