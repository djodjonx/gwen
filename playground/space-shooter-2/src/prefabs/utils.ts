import type { EngineAPI, EntityId } from '@gwenjs/core';
import { Tag } from '../components';

export const SCORE_PER_ENEMY = 100;

export function destroyWithPhysics(api: EngineAPI, id: EntityId): void {
  // Already destroyed this frame.
  if (!api.getComponent(id, Tag)) return;

  // Physics body cleanup is centralized in plugin hook `entity:destroy`.
  api.destroyEntity(id);
}
