import { defineSystem } from '@gwen/engine-core';
import type { Physics2DAPI } from '@gwen/plugin-physics2d';
import { Position, Collider, Tag } from '../components';

const PIXELS_PER_METER = 50;

// GWEN EntityId = (generation << 20) | index — Rapier needs the raw slot index only.
const INDEX_MASK = 0xfffff;
function entityIndex(id: number): number {
  return id & INDEX_MASK;
}

export const PhysicsBindingSystem = defineSystem('PhysicsBindingSystem', () => {
  let physics: Physics2DAPI | null = null;
  const registered = new Set<number>(); // packed EntityIds currently in Rapier

  return {
    onInit(api) {
      physics = api.services.get('physics');
    },

    onBeforeUpdate(api, _dt) {
      if (!physics) return;

      const entities = api.query([Position.name, Collider.name, Tag.name]);

      for (const id of entities) {
        const pos = api.getComponent(id, Position);
        const col = api.getComponent(id, Collider);
        if (!pos || !col) continue;

        const idx = entityIndex(id);

        if (!registered.has(id)) {
          const handle = physics.addRigidBody(
            idx,
            'kinematic',
            pos.x / PIXELS_PER_METER,
            pos.y / PIXELS_PER_METER,
          );
          physics.addBallCollider(handle, col.radius / PIXELS_PER_METER, {
            restitution: 0,
            friction: 0,
          });
          registered.add(id);
        } else {
          physics.setKinematicPosition(idx, pos.x / PIXELS_PER_METER, pos.y / PIXELS_PER_METER);
        }
      }

      // Clean up entities destroyed last frame (by MovementSystem.onUpdate or CollisionSystem)
      for (const id of registered) {
        if (!entities.includes(id)) {
          physics.removeBody(entityIndex(id));
          registered.delete(id);
        }
      }
    },

    onDestroy() {
      registered.clear();
      physics = null;
    },
  };
});
