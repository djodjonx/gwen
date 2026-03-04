import { defineSystem } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import type { Physics2DAPI } from '@gwen/plugin-physics2d';
import { Position, Collider, Tag } from '../components';

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

    onUpdate(api: EngineAPI<GwenServices>) {
      if (!physics) return;

      const entities = api.query([Position.name, Collider.name, Tag.name]);

      // Register new entities
      for (const id of entities) {
        if (registered.has(id)) continue;
        const pos = api.getComponent(id, Position);
        const col = api.getComponent(id, Collider);
        if (!pos || !col) continue;

        const handle = physics.addRigidBody(id, 'kinematic', pos.x, pos.y);
        physics.addBallCollider(handle, col.radius, { restitution: 0, friction: 0 });
        registered.add(id);
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
