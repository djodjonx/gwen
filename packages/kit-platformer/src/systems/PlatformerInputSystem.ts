import type { GwenEngine, GwenPlugin } from '@gwenengine/core';
import type { InputMapper } from '@gwenengine/input';
import type { Physics2DAPI } from '@gwenengine/physics2d/core';
import { PlatformerIntent } from '../components/PlatformerIntent.js';

/**
 * Factory that creates a system translating InputMapper state → PlatformerIntent ECS component.
 */
export function PlatformerInputSystem(): GwenPlugin {
  let mapper: InputMapper;
  let debug = false;
  let _engine: GwenEngine | null = null;

  return {
    name: 'PlatformerInputSystem',

    setup(engine: GwenEngine): void {
      _engine = engine;
      mapper = engine.inject('inputMapper' as any) as InputMapper;
      const physics = engine.inject('physics' as any) as Physics2DAPI;
      debug = physics.isDebugEnabled?.() ?? false;
    },

    onBeforeUpdate(_dt: number): void {
      if (!_engine || !mapper) return;

      const entities = [..._engine.createLiveQuery([PlatformerIntent.name])] as any[];
      const axis = mapper.readAxis2D('Move');
      const jumpJustPressed = mapper.isActionJustPressed('Jump');
      const jumpPressed = mapper.isActionPressed('Jump');

      if (debug && jumpJustPressed) {
        console.log(
          `[PlatformerInputSystem] Jump pressed axis=(${axis.x.toFixed(2)},${axis.y.toFixed(2)}) entities=${entities.length}`,
        );
      }

      for (const eid of entities) {
        (_engine as any).addComponent(eid, PlatformerIntent, {
          moveX: axis.x,
          jumpJustPressed,
          jumpPressed,
        });
      }
    },
  } as any;
}
