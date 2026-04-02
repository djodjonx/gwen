import { defineUI } from '@gwenjs/core';
import { BlockVisual } from '../components';
import blockHtml from './templates/block.html?raw';
import blockCss from './styles/block.css?inline';

export const BlockUI = defineUI({
  name: 'BlockUI',

  onMount(api, entityId) {
    api.services.get('htmlUI').mount(entityId, `<style>${blockCss}</style>${blockHtml}`);
  },

  render(api, entityId) {
    const htmlUI = api.services.get('htmlUI');
    const element = htmlUI.el(entityId, 'platformer-block');
    if (!element) return;

    const block = api.getComponent(entityId, BlockVisual);
    if (!block) return;

    element.style.left = `${block.x}px`;
    element.style.top = `${block.y}px`;
    element.style.width = `${block.w}px`;
    element.style.height = `${block.h}px`;
  },

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
});
