import { UIComponent, definePrefab } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';

export const HudPrefab = definePrefab({
  name: 'Hud',
  create(api): EntityId {
    const id = api.createEntity();
    api.addComponent(id, UIComponent, { uiName: 'HudUI' });
    return id;
  },
});
