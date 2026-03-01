import { type EngineAPI } from '@gwen/engine-core';
import type { GwenPlugin } from '@gwen/engine-core';
import type { GwenServices } from '../../engine.config';
import { COMPONENTS as C } from '../components';

export class AiControllerSystem implements GwenPlugin<'AiControllerSystem'> {
  readonly name = 'AiControllerSystem' as const;

  onUpdate(api: EngineAPI<GwenServices>, dt: number): void {
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
