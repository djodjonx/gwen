import { unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { EngineAPI, EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import { Tag } from '../components';

export const SCORE_PER_ENEMY = 100;

export function destroyWithPhysics(api: EngineAPI, id: EntityId): void {
  // Already destroyed this frame.
  if (!api.getComponent(id, Tag)) return;

  const physics = api.services.get('physics') as Physics2DAPI;
  const { index: slot } = unpackEntityId(id);
  physics.removeBody(slot);
  api.destroyEntity(id);
}
