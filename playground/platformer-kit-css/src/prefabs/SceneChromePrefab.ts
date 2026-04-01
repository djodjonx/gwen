import { UIComponent, definePrefab } from '@gwenengine/core';
import type { EntityId } from '@gwenengine/core';

export const SceneChromePrefab = definePrefab({
  name: 'SceneChrome',
  create(api): EntityId {
    const id = api.createEntity();
    api.addComponent(id, UIComponent, { uiName: 'SceneChromeUI' });
    return id;
  },
});
