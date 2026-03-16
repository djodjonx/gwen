import { defineUI, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import { PlatformerIntent } from '@djodjonx/gwen-kit-platformer';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';

const PPM = 50;

/**
 * Local registry for block dimensions to avoid polluting EntityId (bigint)
 */
export const blockSizes = new Map<bigint, { w: number; h: number }>();

/**
 * Player UI component
 */
export const PlayerUI = defineUI('PlayerUI', () => {
  let facingLeft = false;

  return {
    onMount(api, entity) {
      const el = document.createElement('div');
      el.className = 'player';
      document.getElementById('game-world')?.appendChild(el);
      (api as any)._els = (api as any)._els || new Map();
      (api as any)._els.set(entity, el);
    },
    render(api, entity) {
      const el = (api as any)._els?.get(entity);
      if (!el) return;

      const physics = api.services.get('physics') as Physics2DAPI;
      const intent = api.getComponent(entity, PlatformerIntent);

      const { index: slot } = unpackEntityId(entity as EntityId);
      const pos = physics.getPosition(slot);
      const vel = physics.getLinearVelocity(slot); // Ajout pour le debug

      if (pos) {
        // Log de debug pour l'analyse de vélocité
        if (Math.abs(vel.x) > 0.1) {
          console.log(
            `[DEBUG PHYSICS] PosX: ${pos.x.toFixed(2)}m | VelX: ${vel.x.toFixed(2)}m/s | RenderX: ${(pos.x * PPM).toFixed(2)}px`,
          );
        }

        el.style.left = `${pos.x * PPM}px`;
        el.style.top = `${pos.y * PPM}px`;

        if (intent) {
          if (intent.moveX < 0) facingLeft = true;
          if (intent.moveX > 0) facingLeft = false;
          el.classList.toggle('facing-left', facingLeft);
        }
      }
    },
    onUnmount(api, entity) {
      const el = (api as any)._els?.get(entity);
      el?.remove();
      (api as any)._els?.delete(entity);
    },
  };
});

/**
 * Block UI component
 */
export const BlockUI = defineUI('BlockUI', () => {
  return {
    onMount(api, entity) {
      const el = document.createElement('div');
      el.className = 'block grass';
      document.getElementById('game-world')?.appendChild(el);
      (api as any)._els = (api as any)._els || new Map();
      (api as any)._els.set(entity, el);
    },
    render(api, entity) {
      const el = (api as any)._els?.get(entity);
      if (!el) return;

      const physics = api.services.get('physics') as Physics2DAPI;
      const { index: slot } = unpackEntityId(entity as EntityId);
      const pos = physics.getPosition(slot);

      if (pos) {
        el.style.left = `${pos.x * PPM}px`;
        el.style.top = `${pos.y * PPM}px`;

        const size = blockSizes.get(entity as bigint) || { w: 32, h: 32 };
        el.style.width = `${size.w}px`;
        el.style.height = `${size.h}px`;
      }
    },
    onUnmount(api, entity) {
      const el = (api as any)._els?.get(entity);
      el?.remove();
      (api as any)._els?.delete(entity);
      blockSizes.delete(entity as bigint);
    },
  };
});

/**
 * HUD UI component
 */
export const HudUI = defineUI('HudUI', () => {
  return {
    onMount(api, entity) {
      const container = document.createElement('div');
      container.className = 'hud';

      const status = document.createElement('div');
      status.className = 'status-text';
      status.textContent = 'GWEN PLATFORMER KIT';
      container.appendChild(status);

      const sub = document.createElement('div');
      sub.style.fontSize = '0.8rem';
      sub.style.opacity = '0.7';
      sub.textContent = 'Move with WASD / Arrows — CSS Rendering';
      container.appendChild(sub);

      document.getElementById('game-viewport')?.appendChild(container);
      (api as any)._els = (api as any)._els || new Map();
      (api as any)._els.set(entity, container);
    },
    render() {
      // Static HUD, no update needed
    },
    onUnmount(api, entity) {
      const el = (api as any)._els?.get(entity);
      el?.remove();
      (api as any)._els?.delete(entity);
    },
  };
});
