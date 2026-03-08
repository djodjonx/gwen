import { defineUI } from '@gwen/engine-core';
import bootHtml from './boot.html?raw';
import bootCss from './boot.css?raw';

export const BootUI = defineUI({
  name: 'BootUI',

  onMount(api, entityId) {
    const htmlUI = api.services.get('htmlUI');
    htmlUI.mount(entityId, `<style>${bootCss}</style>${bootHtml}`);
  },

  render() {},

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
});
