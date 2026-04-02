import { UIComponent, definePrefab } from '@gwenjs/core';
import type { EntityId } from '@gwenjs/core';

export const SceneChromePrefab = definePrefab({
  name: 'SceneChrome',
  create(api): EntityId {
    const id = api.createEntity();
    api.addComponent(id, UIComponent, { uiName: 'SceneChromeUI' });
    return id;
  },
});
