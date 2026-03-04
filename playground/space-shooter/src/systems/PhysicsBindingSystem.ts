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

        if (!registered.has(id)) {
          // First time: register body + collider
          const handle = physics.addRigidBody(
            id,
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
          // Every frame: push current TS position into Rapier
          physics.setKinematicPosition(id, pos.x / PIXELS_PER_METER, pos.y / PIXELS_PER_METER);
        }
      }

      // Clean up destroyed entities
      for (const id of registered) {
        if (!entities.includes(id)) {
          physics.removeBody(id);
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
