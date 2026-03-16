import { defineSystem, unpackEntityId } from '@djodjonx/gwen-engine-core';
import { createPlatformerGroundedSystem } from '@djodjonx/gwen-plugin-physics2d';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '../components/PlatformerController.js';
import { PlatformerIntent } from '../components/PlatformerIntent.js';

/**
 * Reads PlatformerIntent and applies movement via Physics2DAPI.
 * Has no knowledge of keyboard, gamepad, or InputMapper.
 *
 * Features:
 * - Coyote time  — jump window after leaving a platform (coyoteMs)
 * - Jump buffer  — jump input memory before landing (jumpBufferMs)
 * - Fall cap     — prevents tunneling through thin floors (maxFallSpeed)
 *
 * Required Physics2DAPI contract:
 *   getLinearVelocity(eid): { x, y } | null
 *   setLinearVelocity(eid, vx, vy): void
 *   isGrounded(eid): boolean  ← implement via foot sensor or Grounded component
 *
 * Memory: coyote/buffer Maps are cleaned up on entity:destroy to prevent leaks.
 */
export const PlatformerMovementSystem = defineSystem('PlatformerMovementSystem', () => {
  let physics: Physics2DAPI;
  let grounded: ReturnType<typeof createPlatformerGroundedSystem>;

  const coyoteTimers = new Map<bigint, number>(); // EntityId → ms remaining
  const jumpBuffers = new Map<bigint, number>(); // EntityId → ms remaining

  return {
    onInit(api) {
      physics = api.services.get('physics') as Physics2DAPI;
      grounded = createPlatformerGroundedSystem({ physics });

      // Cleanup on entity destroy — prevents memory leaks on spawn/despawn
      api.hooks.hook('entity:destroy', (eid: EntityId) => {
        coyoteTimers.delete(eid);
        jumpBuffers.delete(eid);
      });
    },

    onUpdate(api, dt) {
      const dtMs = dt * 1000;

      for (const eid of api.query([PlatformerController, PlatformerIntent])) {
        const { index: slot } = unpackEntityId(eid);
        const ctrl = api.getComponent(eid, PlatformerController) ?? PLATFORMER_CONTROLLER_DEFAULTS;
        const intent = api.getComponent(eid, PlatformerIntent);
        if (!intent) continue;

        const vel = physics.getLinearVelocity(slot);
        if (!vel) continue;

        // ── Horizontal movement ───────────────────────────────────────
        const targetVx = intent.moveX * ctrl.speed;
        physics.setLinearVelocity(slot, targetVx, Math.max(vel.y, -ctrl.maxFallSpeed));

        // ── Coyote time ───────────────────────────────────────────────
        const isOnGround = grounded.isGrounded(slot);
        let coyote = coyoteTimers.get(eid) ?? 0;
        coyote = isOnGround ? ctrl.coyoteMs : Math.max(0, coyote - dtMs);
        coyoteTimers.set(eid, coyote);

        // ── Jump buffer ───────────────────────────────────────────────
        let buffer = jumpBuffers.get(eid) ?? 0;
        buffer = intent.jumpJustPressed ? ctrl.jumpBufferMs : Math.max(0, buffer - dtMs);
        jumpBuffers.set(eid, buffer);

        // ── Jump resolution ───────────────────────────────────────────
        if (buffer > 0 && (isOnGround || coyote > 0)) {
          physics.setLinearVelocity(slot, targetVx, -ctrl.jumpForce);
          jumpBuffers.set(eid, 0);
          coyoteTimers.set(eid, 0);
        }
      }
    },
  };
});
