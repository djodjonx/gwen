import { UIComponent, definePrefab } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';

export const SceneChromePrefab = definePrefab({
  name: 'SceneChrome',
  create(api): EntityId {
    const id = api.createEntity();
    api.addComponent(id, UIComponent, { uiName: 'SceneChromeUI' });
    return id;
  },
});
