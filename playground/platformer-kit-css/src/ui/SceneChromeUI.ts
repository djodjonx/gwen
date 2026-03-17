import { defineUI } from '@djodjonx/gwen-engine-core';
import sceneChromeHtml from './templates/sceneChrome.html?raw';
import sceneChromeCss from './styles/sceneChrome.css?inline';

export const SceneChromeUI = defineUI({
  name: 'SceneChromeUI',

  onMount(api, entityId) {
    api.services
      .get('htmlUI')
      .mount(entityId, `<style>${sceneChromeCss}</style>${sceneChromeHtml}`);
  },

  render() {},

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
});
