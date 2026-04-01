import { UIComponent, definePrefab } from '@gwenengine/core';
import type { EntityId } from '@gwenengine/core';

export const HudPrefab = definePrefab({
  name: 'Hud',
  create(api): EntityId {
    const id = api.createEntity();
    api.addComponent(id, UIComponent, { uiName: 'HudUI' });
    return id;
  },
});
