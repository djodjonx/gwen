import { defineUI } from '@djodjonx/gwen-engine-core';
import { Position } from '../components';

export const EnemyUI = defineUI({
  name: 'EnemyUI',

  extensions: {
    spriteAnim: {
      atlas: '/sprites/enemy.svg',
      frame: { width: 32, height: 32, columns: 1 },
      clips: {
        idle: { frames: [0], fps: 8, loop: true },
        shoot: { frames: [0], fps: 12, loop: false, next: 'idle' },
      },
      controller: {
        initial: 'idle',
        parameters: {
          shoot: { type: 'trigger' },
        },
        states: {
          idle: { clip: 'idle' },
          shoot: { clip: 'shoot' },
        },
        transitions: [
          { from: '*', to: 'shoot', priority: 1, conditions: [{ param: 'shoot' }] },
          { from: 'shoot', to: 'idle', hasExitTime: true, exitTime: 0.95 },
        ],
      },
      anchor: 'center',
      visible: true,
    },
  },

  render(api, id) {
    const pos = api.getComponent(id, Position);
    if (!pos) return;

    const renderer = api.services.get('renderer');
    const animator = api.services.get('animator');
    animator.draw(renderer.ctx, id, pos.x, pos.y, {
      width: 32,
      height: 32,
      pixelSnap: true,
      cullRect: {
        x: 0,
        y: 0,
        width: renderer.logicalWidth,
        height: renderer.logicalHeight,
      },
    });
  },
});
