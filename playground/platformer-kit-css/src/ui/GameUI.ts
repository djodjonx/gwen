import { defineUI, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import { PlatformerIntent } from '@djodjonx/gwen-kit-platformer';
import { getBodySnapshot, getSpeed } from '@djodjonx/gwen-plugin-physics2d/helpers/queries';

const PPM = 50;

const uiElements = new Map<EntityId, HTMLElement>();

function mountElement(entity: EntityId, el: HTMLElement): void {
  uiElements.set(entity, el);
}

function getMountedElement(entity: EntityId): HTMLElement | undefined {
  return uiElements.get(entity);
}

function unmountElement(entity: EntityId): void {
  const el = uiElements.get(entity);
  el?.remove();
  uiElements.delete(entity);
}

/**
 * Local registry for static block layout (pixels) used by CSS rendering.
 */
export const blockLayout = new Map<EntityId, { x: number; y: number; w: number; h: number }>();

/**
 * Player UI component
 */
export const PlayerUI = defineUI('PlayerUI', () => {
  let facingLeft = false;

  return {
    onMount(_api, entity) {
      const el = document.createElement('div');
      el.className = 'player';
      document.getElementById('game-world')?.appendChild(el);
      mountElement(entity, el);
    },
    render(api, entity) {
      const el = getMountedElement(entity);
      if (!el) return;

      const physics = api.services.get('physics');
      const intent = api.getComponent(entity, PlatformerIntent);

      const { index: slot } = unpackEntityId(entity);
      const snap = getBodySnapshot(physics, slot);
      const speed = getSpeed(physics, slot);

      if (snap.position) {
        el.style.left = `${snap.position.x * PPM}px`;
        el.style.top = `${snap.position.y * PPM}px`;
        el.dataset.speedMps = speed.toFixed(2);

        if (intent) {
          if (intent.moveX < 0) facingLeft = true;
          if (intent.moveX > 0) facingLeft = false;
          el.classList.toggle('facing-left', facingLeft);
        }
      }
    },
    onUnmount(_api, entity) {
      unmountElement(entity);
    },
  };
});

/**
 * Block UI component
 */
export const BlockUI = defineUI('BlockUI', () => {
  return {
    onMount(_api, entity) {
      const el = document.createElement('div');
      el.className = 'block grass';
      document.getElementById('game-world')?.appendChild(el);
      mountElement(entity, el);
    },
    render(api, entity) {
      const el = getMountedElement(entity);
      if (!el) return;

      const data = blockLayout.get(entity) ?? { x: 0, y: 0, w: 32, h: 32 };

      el.style.left = `${data.x}px`;
      el.style.top = `${data.y}px`;
      el.style.width = `${data.w}px`;
      el.style.height = `${data.h}px`;
    },
    onUnmount(_api, entity) {
      unmountElement(entity);
      blockLayout.delete(entity);
    },
  };
});

/**
 * HUD UI component
 */
export const HudUI = defineUI('HudUI', () => {
  return {
    onMount(_api, entity) {
      const container = document.createElement('div');
      container.className = 'hud';

      const status = document.createElement('div');
      status.className = 'status-text';
      status.textContent = 'GWEN PLATFORMER KIT';
      container.appendChild(status);

      const sub = document.createElement('div');
      sub.style.fontSize = '0.8rem';
      sub.style.opacity = '0.7';
      sub.textContent = 'Move with WASD / Arrows — CSS + Merged Tilemap Colliders';
      container.appendChild(sub);

      document.getElementById('game-viewport')?.appendChild(container);
      mountElement(entity, container);
    },
    render() {
      // Static HUD, no update needed
    },
    onUnmount(_api, entity) {
      unmountElement(entity);
    },
  };
});
