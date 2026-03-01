import { type TsPlugin, type EngineAPI } from '@gwen/engine-core';
import { COMPONENTS as C, type Position, type Velocity } from '../components';

export class MovementSystem implements TsPlugin {
  readonly name = 'MovementSystem';

  onUpdate(api: EngineAPI, dt: number): void {
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
