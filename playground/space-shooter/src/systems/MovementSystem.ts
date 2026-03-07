import { defineSystem } from '@gwen/engine-core';
import { Position, Velocity } from '../components';

export const MovementSystem = defineSystem('MovementSystem', () => {
  // Entities to destroy after PhysicsBindingSystem has had a chance to
  // register them. We move positions in onBeforeUpdate (so Rapier sees
  // correct positions before step()), but we only destroy off-screen entities
  // in onUpdate — after the physics step — so they are always registered in
  // Rapier for at least one full frame and their slot is never wasted.
  const toDestroy: import('@gwen/engine-core').EntityId[] = [];
  return {
    onBeforeUpdate(api, dt) {
      toDestroy.length = 0;

      const movables = api.query([Position.name, Velocity.name]);
      for (const id of movables) {
        const pos = api.getComponent(id, Position);
        const vel = api.getComponent(id, Velocity);
        if (!pos || !vel) continue;

        api.addComponent(id, Position, {
          x: pos.x + vel.vx * dt,
          y: pos.y + vel.vy * dt,
        });

        // Flag off-screen entities for deferred destruction.
        // Destroying here (before PhysicsBindingSystem runs) would cause
        // the entity to be registered in Rapier then immediately removed
        // in the same onBeforeUpdate, wasting a slot and missing collisions.
        if (pos.y < -80 || pos.y > 720 || pos.x < -80 || pos.x > 560) {
          toDestroy.push(id);
        }
      }
    },

    onUpdate(api) {
      // Destroy off-screen entities after the physics step has run.
      // PhysicsBindingSystem.cleanup (next onBeforeUpdate) will call
      // physics.removeBody() and clean up the Rapier side.
      for (const id of toDestroy) {
        api.destroyEntity(id);
      }
      toDestroy.length = 0;
    },
  };
});
