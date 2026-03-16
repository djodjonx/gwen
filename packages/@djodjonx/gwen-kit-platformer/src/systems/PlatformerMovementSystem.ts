import { defineSystem, unpackEntityId } from '@djodjonx/gwen-engine-core';
import { createPlatformerGroundedSystem } from '@djodjonx/gwen-plugin-physics2d';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '../components/PlatformerController.js';
import { PlatformerIntent } from '../components/PlatformerIntent.js';
import { toPhysicsScalar } from '../units.js';

/**
 * Reads PlatformerIntent and applies movement via Physics2DAPI.
 */
export const PlatformerMovementSystem = defineSystem('PlatformerMovementSystem', () => {
  let physics: Physics2DAPI;
  let grounded: ReturnType<typeof createPlatformerGroundedSystem>;

  const coyoteTimers = new Map<bigint, number>();
  const jumpBuffers = new Map<bigint, number>();

  return {
    onInit(api) {
      physics = api.services.get('physics') as Physics2DAPI;
      grounded = createPlatformerGroundedSystem({ physics });

      api.hooks.hook('entity:destroy', (eid: EntityId) => {
        coyoteTimers.delete(eid);
        jumpBuffers.delete(eid);
      });
    },

    onUpdate(api, dt) {
      const dtMs = dt * 1000;
      const entities = api.query([PlatformerController, PlatformerIntent]);

      for (const eid of entities) {
        const { index: slot } = unpackEntityId(eid);
        const ctrl = api.getComponent(eid, PlatformerController) ?? PLATFORMER_CONTROLLER_DEFAULTS;
        const intent = api.getComponent(eid, PlatformerIntent);
        if (!intent) continue;

        const vel = physics.getLinearVelocity(slot);
        if (!vel) continue;

        // Horizontal movement
        const speed = toPhysicsScalar(ctrl.speed, ctrl.units, ctrl.pixelsPerMeter);
        const jumpForce = toPhysicsScalar(ctrl.jumpForce, ctrl.units, ctrl.pixelsPerMeter);
        const maxFallSpeed = toPhysicsScalar(ctrl.maxFallSpeed, ctrl.units, ctrl.pixelsPerMeter);
        const targetVx = intent.moveX * speed;
        physics.setLinearVelocity(slot, targetVx, Math.max(vel.y, -maxFallSpeed));

        // Coyote time
        const isOnGround = grounded.isGrounded(slot);
        let coyote = coyoteTimers.get(eid) ?? 0;
        coyote = isOnGround ? ctrl.coyoteMs : Math.max(0, coyote - dtMs);
        coyoteTimers.set(eid, coyote);

        // Jump buffer
        let buffer = jumpBuffers.get(eid) ?? 0;
        buffer = intent.jumpJustPressed ? ctrl.jumpBufferMs : Math.max(0, buffer - dtMs);
        jumpBuffers.set(eid, buffer);

        // Jump resolution
        if (buffer > 0 && (isOnGround || coyote > 0)) {
          physics.setLinearVelocity(slot, targetVx, -jumpForce);
          jumpBuffers.set(eid, 0);
          coyoteTimers.set(eid, 0);
        }
      }
    },
  };
});
