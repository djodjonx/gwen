import { type TsPlugin, type EngineAPI } from '@gwen/engine-core';
import { COMPONENTS as C, type Position, type ShootTimer, type Tag } from '../components';

export class AiControllerSystem implements TsPlugin {
  readonly name = 'AiControllerSystem';

  onUpdate(api: EngineAPI, dt: number): void {
    const enemies = api.query([C.TAG.name, C.POSITION.name, C.SHOOT_TIMER.name]);
    for (const id of enemies) {
      const tag = api.getComponent(id, C.TAG);
      if (tag?.type !== 'enemy') continue;

      const timer = api.getComponent(id, C.SHOOT_TIMER)!;
      const elapsed = timer.elapsed + dt;

      if (elapsed >= timer.cooldown) {
        const pos = api.getComponent(id, C.POSITION)!;
        api.prefabs.instantiate('Bullet', pos.x, pos.y + 16, 0, 350, 'enemy-bullet');
        api.addComponent(id, C.SHOOT_TIMER, { ...timer, elapsed: 0 });
      } else {
        api.addComponent(id, C.SHOOT_TIMER, { ...timer, elapsed });
      }
    }
  }
}
