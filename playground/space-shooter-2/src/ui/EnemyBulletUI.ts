import { defineUI } from '@djodjonx/gwen-engine-core';
import { Position } from '../components';

export const EnemyBulletUI = defineUI({
  name: 'EnemyBulletUI',

  extensions: {
    spriteAnim: {
      atlas: '/sprites/bullet-enemy.svg',
      frame: { width: 16, height: 16, columns: 1 },
      clips: {
        idle: { frames: [0], fps: 24, loop: true },
      },
      initial: 'idle',
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
      width: 10,
      height: 10,
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
