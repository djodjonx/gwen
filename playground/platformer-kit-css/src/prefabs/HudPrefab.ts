import { UIComponent, definePrefab } from '@gwenjs/core';
import type { EntityId } from '@gwenjs/core';

export const HudPrefab = definePrefab({
  name: 'Hud',
  create(api): EntityId {
    const id = api.createEntity();
    api.addComponent(id, UIComponent, { uiName: 'HudUI' });
    return id;
  },
});
