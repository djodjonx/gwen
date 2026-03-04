import { defineSystem } from '@gwen/engine-core';
import type { Physics2DAPI } from '@gwen/plugin-physics2d';
import { Position, Collider, Tag } from '../components';

/**
 * 1 physics metre = PIXELS_PER_METER canvas pixels.
 * All positions and radii are divided by this factor before being passed
 * to Rapier, so collision detection works at a sane scale regardless of
 * canvas size. Bullet radius ≈ 5px → 0.1 m, player ≈ 14px → 0.28 m.
 */
const PIXELS_PER_METER = 50;

/**
 * GWEN EntityId is a packed number: (generation << 20) | index.
 * Rapier only needs the stable slot index (lower 20 bits) as entity_index.
 * Using the full packed ID would cause indices > 10_000 to exceed the
 * max_entities guard in the WASM plugin, silently dropping the entity.
 */
const INDEX_MASK = 0xfffff; // lower 20 bits
function entityIndex(id: number): number {
  return id & INDEX_MASK;
}

/**
 * PhysicsBindingSystem
 *
 * Registers newly spawned entities into the Rapier2D simulation as
 * kinematic bodies. Kinematic means: MovementSystem drives position every
 * frame, Rapier only handles collision detection.
 *
 * Must run BEFORE CollisionSystem in the scene system list.
 */
export const PhysicsBindingSystem = defineSystem('PhysicsBindingSystem', () => {
  let physics: Physics2DAPI | null = null;
  const registered = new Set<number>();

  return {
    onInit(api) {
      physics = api.services.get('physics');
    },

    onBeforeUpdate(api, _dt) {
      if (!physics) return;

      const entities = api.query([Position.name, Collider.name, Tag.name]);

      // Register new entities + update kinematic positions every frame
      for (const id of entities) {
        const pos = api.getComponent(id, Position);
        const col = api.getComponent(id, Collider);
        if (!pos || !col) continue;

        const idx = entityIndex(id); // extract pure slot index from packed EntityId

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

      // Clean up destroyed entities.
      // Note: CollisionSystem may have already called physics.removeBody(idx)
      // in the same frame via destroyWithPhysics(). Calling removeBody again
      // on an unknown slot is a no-op in Rapier (entity_to_body.remove returns None),
      // so this is safe — but we still must clean up the registered set.
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
