import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { InputMapper } from '@djodjonx/gwen-plugin-input';
import { PlatformerIntent } from '../components/PlatformerIntent.js';

/**
 * Translates InputMapper state → PlatformerIntent ECS component.
 *
 * Must run BEFORE PlatformerMovementSystem each frame.
 * Registered via createPlatformerScene() or manually in scene.systems[].
 *
 * Uses defineSystem Form 2 (factory closure) to hold the `mapper` reference.
 * SceneManager auto-resolves SystemFactory entries in systems[] — no need
 * to call PlatformerInputSystem() manually.
 *
 * Rule: resolve 'inputMapper' service in onInit(), never in onBeforeUpdate().
 */
export const PlatformerInputSystem = defineSystem('PlatformerInputSystem', () => {
  let mapper: InputMapper;

  return {
    onInit(api) {
      mapper = api.services.get('inputMapper') as InputMapper;
    },

    onBeforeUpdate(api) {
      for (const eid of api.query([PlatformerIntent])) {
        api.addComponent(eid, PlatformerIntent, {
          moveX: mapper.readAxis2D('Move').x,
          jumpJustPressed: mapper.isActionJustPressed('Jump'),
          jumpPressed: mapper.isActionPressed('Jump'),
        });
      }
    },
  };
});
