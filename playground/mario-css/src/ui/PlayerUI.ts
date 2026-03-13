import { defineUI, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import { PlayerState } from '../components/index.ts';
import { ASSETS } from '../assets.ts';
import { PLAYER_W, PLAYER_H } from '../prefabs/PlayerPrefab.ts';

const PPM = 50; // pixels per meter

/**
 * PlayerUI — sprite Mario positionné via physics chaque frame.
 */
export const PlayerUI = defineUI('PlayerUI', () => {
  const els = new Map<bigint, HTMLDivElement>();

  return {
    onMount(_api, entityId) {
      const world = document.getElementById('game-world');
      if (!world) return;
      const el = document.createElement('div');
      el.className = 'mario-player';
      el.style.backgroundImage = `url("${ASSETS.MARIO_IDLE}")`;
      world.appendChild(el);
      els.set(entityId, el);
    },

    render(api, entityId) {
      const el = els.get(entityId);
      if (!el) return;

      const physics = api.services.get('physics') as Physics2DAPI;
      const ps = api.getComponent(entityId, PlayerState);
      if (!ps) return;

      const { index: slot } = unpackEntityId(entityId);
      const pos = physics.getPosition(slot);
      if (!pos) return;

      // pos = centre du body en mètres → convertir en pixels
      const pxX = pos.x * PPM;
      const pxY = pos.y * PPM;

      // translate positionne le coin supérieur gauche du sprite
      const scaleX = ps.facingLeft ? -1 : 1;
      el.style.transform = `translate(${pxX - PLAYER_W / 2}px, ${pxY - PLAYER_H / 2}px) scaleX(${scaleX})`;

      const vel = physics.getLinearVelocity(slot);
      const vy = vel?.y ?? 0;
      const vx = vel?.x ?? 0;

      if (!ps.grounded && vy < -0.5) {
        el.style.backgroundImage = `url("${ASSETS.MARIO_JUMP}")`;
      } else if (Math.abs(vx) > 0.5) {
        el.style.backgroundImage = `url("${ASSETS.MARIO_WALK}")`;
      } else {
        el.style.backgroundImage = `url("${ASSETS.MARIO_IDLE}")`;
      }
    },

    onUnmount(_api, entityId) {
      els.get(entityId)?.remove();
      els.delete(entityId);
    },
  };
});
