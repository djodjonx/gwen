import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { InputMapper } from '@djodjonx/gwen-plugin-input';
import { PlatformerIntent } from '../components/PlatformerIntent.js';

/**
 * Translates InputMapper state → PlatformerIntent ECS component.
 */
export const PlatformerInputSystem = defineSystem('PlatformerInputSystem', () => {
  let mapper: InputMapper;

  return {
    onInit(api) {
      mapper = api.services.get('inputMapper') as InputMapper;
    },

    onBeforeUpdate(api) {
      const entities = api.query([PlatformerIntent.name]);
      const axis = mapper.readAxis2D('Move');

      for (const eid of entities) {
        api.addComponent(eid, PlatformerIntent, {
          moveX: axis.x,
          jumpJustPressed: mapper.isActionJustPressed('Jump'),
          jumpPressed: mapper.isActionPressed('Jump'),
        });
      }
    },
  };
});
