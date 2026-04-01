import { defineSystem } from '@gwenengine/core';
import type { InputMapper } from '@gwenengine/input';
import type { Physics2DAPI } from '@gwenengine/physics2d/core';
import { PlatformerIntent } from '../components/PlatformerIntent.js';

/**
 * Translates InputMapper state → PlatformerIntent ECS component.
 */
export const PlatformerInputSystem = defineSystem('PlatformerInputSystem', () => {
  let mapper: InputMapper;
  let debug = false;

  return {
    onInit(api) {
      mapper = api.services.get('inputMapper') as InputMapper;
      const physics = api.services.get('physics') as Physics2DAPI;
      debug = physics.isDebugEnabled?.() ?? false;
    },

    onBeforeUpdate(api) {
      const entities = api.query([PlatformerIntent.name]);
      const axis = mapper.readAxis2D('Move');
      const jumpJustPressed = mapper.isActionJustPressed('Jump');
      const jumpPressed = mapper.isActionPressed('Jump');

      if (debug && jumpJustPressed) {
        console.log(
          `[PlatformerInputSystem] Jump pressed axis=(${axis.x.toFixed(2)},${axis.y.toFixed(2)}) entities=${entities.length}`,
        );
      }

      for (const eid of entities) {
        api.addComponent(eid, PlatformerIntent, {
          moveX: axis.x,
          jumpJustPressed,
          jumpPressed,
        });
      }
    },
  };
});
