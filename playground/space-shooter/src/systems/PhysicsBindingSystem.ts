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

  // registered : packed EntityId → still alive in Rapier
  const registered = new Set<number>();

  // slotToPackedId : raw slot index → packed EntityId registered in Rapier.
  // This is the source of truth for CollisionSystem to reconstruct packed IDs.
  // It is kept in sync here and exported via the physics service snapshot.
  // Key insight: we must snapshot the generation AT REGISTRATION TIME,
  // not read it at event-processing time (generation may have changed by then
  // if MovementSystem destroyed & recycled the slot in the same frame).
  const slotToPackedId = new Map<number, number>();

  return {
    onInit(api) {
      physics = api.services.get('physics');
      // Expose the slot→packedId map on the physics service so CollisionSystem
      // can access it without coupling to PhysicsBindingSystem directly.
      if (physics) {
        (physics as unknown as Record<string, unknown>)['_slotToPackedId'] = slotToPackedId;
      }
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
          // Snapshot: slot index → packed EntityId at registration time
          slotToPackedId.set(idx, id);
        } else {
          physics.setKinematicPosition(idx, pos.x / PIXELS_PER_METER, pos.y / PIXELS_PER_METER);
        }
      }

      // Clean up destroyed entities
      for (const id of registered) {
        if (!entities.includes(id)) {
          const idx = entityIndex(id);
          physics.removeBody(idx);
          registered.delete(id);
          slotToPackedId.delete(idx);
        }
      }
    },

    onDestroy() {
      registered.clear();
      slotToPackedId.clear();
      physics = null;
    },
  };
});
