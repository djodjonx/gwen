import { defineUI } from '@gwenengine/core';
import { getBodySnapshot, getSpeed } from '@gwenengine/physics2d/helpers/queries';
import { PlayerTag } from '../components';
import hudHtml from './templates/hud.html?raw';
import hudCss from './styles/hud.css?inline';

const PIXELS_PER_METER = 50;

export const HudUI = defineUI({
  name: 'HudUI',

  onMount(api, entityId) {
    api.services.get('htmlUI').mount(entityId, `<style>${hudCss}</style>${hudHtml}`);
  },

  render(api, entityId) {
    const player = api.query([PlayerTag])[0];
    if (!player) return;

    const physics = api.services.get('physics');
    const snapshot = getBodySnapshot(physics, player);
    const speed = getSpeed(physics, player);

    const htmlUI = api.services.get('htmlUI');

    if (snapshot.position) {
      htmlUI.text(
        entityId,
        'platformer-position',
        `Player: ${Math.round(snapshot.position.x * PIXELS_PER_METER)}, ${Math.round(snapshot.position.y * PIXELS_PER_METER)}`,
      );
    }

    htmlUI.text(entityId, 'platformer-speed', `Speed: ${speed.toFixed(2)} m/s`);
  },

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
});
