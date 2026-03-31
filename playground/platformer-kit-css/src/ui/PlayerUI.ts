import { defineUI } from '@djodjonx/gwen-engine-core';
import { PlatformerIntent } from '@djodjonx/gwen-kit-platformer';
import { getBodySnapshot } from '@djodjonx/gwen-plugin-physics2d/helpers/queries';
import {
  VIEWPORT_OFFSET_X_PX,
  VIEWPORT_OFFSET_Y_PX,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from '../level/levelData';
import playerHtml from './templates/player.html?raw';
import playerCss from './styles/player.css?inline';

const PIXELS_PER_METER = 50;

export const PlayerUI = defineUI({
  name: 'PlayerUI',

  onMount(api, entityId) {
    api.services.get('htmlUI').mount(entityId, `<style>${playerCss}</style>${playerHtml}`);
  },

  render(api, entityId) {
    const htmlUI = api.services.get('htmlUI');
    const element = htmlUI.el(entityId, 'platformer-player');
    if (!element) return;

    const physics = api.services.get('physics');
    const snapshot = getBodySnapshot(physics, entityId);
    if (!snapshot.position) return;

    const xPx = snapshot.position.x * PIXELS_PER_METER + VIEWPORT_OFFSET_X_PX;
    const yPx = snapshot.position.y * PIXELS_PER_METER + VIEWPORT_OFFSET_Y_PX;

    element.style.left = `${xPx}px`;
    element.style.top = `${yPx}px`;

    const intent = api.getComponent(entityId, PlatformerIntent);
    if (intent) {
      element.classList.toggle('facing-left', intent.moveX < 0);
    }

    element.style.display =
      xPx < -64 || yPx < -64 || xPx > WORLD_WIDTH_PX + 128 || yPx > WORLD_HEIGHT_PX + 128
        ? 'none'
        : 'block';
  },

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
});
