import { defineUI } from '@gwenengine/core';
import { Position } from '../components';

export const PlayerUI = defineUI({
  name: 'PlayerUI',

  extensions: {
    spriteAnim: {
      atlas: '/sprites/8.png',
      frame: { width: 114, height: 114, columns: 1 },
      clips: {
        idle: { frames: [0], fps: 1, loop: true },
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
      width: 100,
      height: 100,
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
