import { type EngineAPI } from '@gwen/engine-core';
import type { GwenPlugin } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import type { GwenServices } from '../../engine.config';
import { COMPONENTS as C } from '../components';

export class PlayerControllerSystem implements GwenPlugin<'PlayerControllerSystem'> {
  readonly name = 'PlayerControllerSystem' as const;
  private keyboard!: KeyboardInput;

  onInit(api: EngineAPI<GwenServices>): void {
    this.keyboard = api.services.get('keyboard');
  }

  onUpdate(api: EngineAPI<GwenServices>, dt: number): void {
    const playerEntity = api.query([C.TAG.name]).find(id => api.getComponent(id, C.TAG)?.type === 'player');
    if (playerEntity === undefined) return;

    const pos = api.getComponent(playerEntity, C.POSITION);
    if (pos) {
      const speed = 250;
      let vx = 0;
      if (this.keyboard.isPressed('ArrowLeft') || this.keyboard.isPressed('KeyA')) vx = -speed;
      if (this.keyboard.isPressed('ArrowRight') || this.keyboard.isPressed('KeyD')) vx = speed;
      const nx = Math.max(20, Math.min(480 - 20, pos.x + vx * dt));
      api.addComponent(playerEntity, C.POSITION, { x: nx, y: pos.y });
    }

    const timer = api.getComponent(playerEntity, C.SHOOT_TIMER);
    if (timer) {
      const elapsed = timer.elapsed + dt;
      api.addComponent(playerEntity, C.SHOOT_TIMER, { ...timer, elapsed });
      if (this.keyboard.isPressed('Space') && elapsed >= timer.cooldown) {
        if (pos) api.prefabs.instantiate('Bullet', pos.x, pos.y - 20, 0, -600, 'bullet');
        api.addComponent(playerEntity, C.SHOOT_TIMER, { ...timer, elapsed: 0 });
      }
    }
  }
}
