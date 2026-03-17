import { defineSystem, unpackEntityId } from '@djodjonx/gwen-engine-core';
import { createPlatformerGroundedSystem } from '@djodjonx/gwen-plugin-physics2d/core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d/core';
import {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '../components/PlatformerController.js';
import { PlatformerIntent } from '../components/PlatformerIntent.js';
import {
  canApplyJump,
  createJumpResolverState,
  markJumpApplied,
  stepJumpResolver,
  tryConfirmLanding,
} from './platformer/jumpResolver.js';
import {
  createGroundHysteresisState,
  resolveGroundedWithHysteresis,
} from './platformer/groundHysteresis.js';
import { toPhysicsScalar, type PlatformerUnits } from '../units.js';

type ControllerMovementConfig = {
  speed: number;
  jumpVelocity: number;
  maxFallSpeed: number;
  jumpCoyoteMs: number;
  jumpBufferWindowMs: number;
  groundEnterFrames: number;
  groundExitFrames: number;
  postJumpLockMs: number;
};

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickNumber(
  primary: number | undefined,
  legacy: number | undefined,
  fallback: number,
): number {
  if (isValidNumber(primary)) return primary;
  if (isValidNumber(legacy)) return legacy;
  return fallback;
}

type ControllerLike = {
  speed?: number;
  jumpVelocity?: number;
  jumpForce?: number;
  maxFallSpeed?: number;
  jumpCoyoteMs?: number;
  coyoteMs?: number;
  jumpBufferWindowMs?: number;
  jumpBufferMs?: number;
  groundEnterFrames?: number;
  groundExitFrames?: number;
  postJumpLockMs?: number;
};

function normalizeUnits(units: string): PlatformerUnits {
  return units === 'meters' ? 'meters' : 'pixels';
}

function resolveMovementConfig(ctrl: ControllerLike): ControllerMovementConfig {
  const defaults = PLATFORMER_CONTROLLER_DEFAULTS;

  return {
    speed: pickNumber(ctrl.speed, undefined, defaults.speed),
    jumpVelocity: pickNumber(ctrl.jumpVelocity, ctrl.jumpForce, defaults.jumpVelocity),
    maxFallSpeed: pickNumber(ctrl.maxFallSpeed, undefined, defaults.maxFallSpeed),
    jumpCoyoteMs: pickNumber(ctrl.jumpCoyoteMs, ctrl.coyoteMs, defaults.jumpCoyoteMs),
    jumpBufferWindowMs: pickNumber(
      ctrl.jumpBufferWindowMs,
      ctrl.jumpBufferMs,
      defaults.jumpBufferWindowMs,
    ),
    groundEnterFrames: pickNumber(ctrl.groundEnterFrames, undefined, defaults.groundEnterFrames),
    groundExitFrames: pickNumber(ctrl.groundExitFrames, undefined, defaults.groundExitFrames),
    postJumpLockMs: pickNumber(ctrl.postJumpLockMs, undefined, defaults.postJumpLockMs),
  };
}

/**
 * Reads PlatformerIntent and applies movement via Physics2DAPI.
 */
export const PlatformerMovementSystem = defineSystem('PlatformerMovementSystem', () => {
  const RESTING_VY_EPSILON = 0.08;
  const RESTING_DY_EPSILON = 0.0015;
  const RESTING_GROUNDED_DELAY_MS = 120;
  const RESTING_LANDING_CONFIRM_MS = 160;

  let physics: Physics2DAPI;
  let grounded: ReturnType<typeof createPlatformerGroundedSystem>;
  let debug = false;
  let debugTick = 0;

  const groundStates = new Map<bigint, ReturnType<typeof createGroundHysteresisState>>();
  const jumpStates = new Map<bigint, ReturnType<typeof createJumpResolverState>>();
  const nearStillAirMs = new Map<bigint, number>();
  const lastYByEntity = new Map<bigint, number>();

  return {
    onInit(api) {
      physics = api.services.get('physics') as Physics2DAPI;
      grounded = createPlatformerGroundedSystem({ physics });
      debug = physics.isDebugEnabled?.() ?? false;

      api.hooks.hook('entity:destroy', (eid: EntityId) => {
        groundStates.delete(eid);
        jumpStates.delete(eid);
        nearStillAirMs.delete(eid);
        lastYByEntity.delete(eid);
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
        const movement = resolveMovementConfig(ctrl);
        const units = normalizeUnits(ctrl.units);
        const speed = toPhysicsScalar(movement.speed, units, ctrl.pixelsPerMeter);
        const jumpVelocity = toPhysicsScalar(movement.jumpVelocity, units, ctrl.pixelsPerMeter);
        const maxFallSpeed = toPhysicsScalar(movement.maxFallSpeed, units, ctrl.pixelsPerMeter);
        const targetVx = intent.moveX * speed;
        physics.setLinearVelocity(slot, targetVx, Math.max(vel.y, -maxFallSpeed));

        const sensorGrounded = grounded.isGrounded(slot);
        const groundState = grounded.getSensorState(slot);
        const groundStateRecord =
          groundStates.get(eid) ?? createGroundHysteresisState(sensorGrounded);
        const hysteresisGrounded = resolveGroundedWithHysteresis(
          groundStateRecord,
          sensorGrounded,
          {
            enterFrames: movement.groundEnterFrames,
            exitFrames: movement.groundExitFrames,
          },
        );
        groundStates.set(eid, groundStateRecord);

        const pos = physics.getPosition?.(slot) ?? null;
        const prevY = lastYByEntity.get(eid) ?? pos?.y;
        if (pos) {
          lastYByEntity.set(eid, pos.y);
        }
        const deltaY =
          pos && prevY !== undefined ? Math.abs(pos.y - prevY) : Number.POSITIVE_INFINITY;

        const isNearResting = Math.abs(vel.y) <= RESTING_VY_EPSILON && deltaY <= RESTING_DY_EPSILON;

        let stillMs = nearStillAirMs.get(eid) ?? 0;
        if (hysteresisGrounded || sensorGrounded || !isNearResting) {
          stillMs = 0;
        } else {
          stillMs += dtMs;
        }
        nearStillAirMs.set(eid, stillMs);
        const inferredGrounded = stillMs >= RESTING_GROUNDED_DELAY_MS;
        const isOnGround = hysteresisGrounded || inferredGrounded;
        const canConfirmLanding =
          hysteresisGrounded ||
          sensorGrounded ||
          (inferredGrounded && stillMs >= RESTING_LANDING_CONFIRM_MS);

        const jumpState = jumpStates.get(eid) ?? createJumpResolverState();
        stepJumpResolver(jumpState, {
          dtMs,
          jumpJustPressed: intent.jumpJustPressed,
          isGrounded: isOnGround,
          config: {
            coyoteMs: movement.jumpCoyoteMs,
            jumpBufferWindowMs: movement.jumpBufferWindowMs,
            postJumpLockMs: movement.postJumpLockMs,
          },
        });
        tryConfirmLanding(jumpState, canConfirmLanding);
        jumpStates.set(eid, jumpState);

        if (debug && intent.jumpJustPressed) {
          console.log(
            `[PlatformerMovementSystem] jump request slot=${slot} grounded=${isOnGround}(sensor=${sensorGrounded},inferred=${inferredGrounded}) contactCount=${groundState.contactCount} coyoteMs=${jumpState.coyoteLeftMs.toFixed(1)} bufferMs=${jumpState.jumpBufferLeftMs.toFixed(1)} lockMs=${jumpState.postJumpLockLeftMs.toFixed(1)} consumed=${jumpState.jumpConsumed} vy=${vel.y.toFixed(3)}`,
          );
        }

        if (debug && debugTick++ % 30 === 0) {
          console.log(
            `[PlatformerMovementSystem] state slot=${slot} vy=${vel.y.toFixed(3)} grounded=${isOnGround}(sensor=${sensorGrounded},inferred=${inferredGrounded}) contacts=${groundState.contactCount} enterFrames=${groundStateRecord.consecutiveGroundFrames} exitFrames=${groundStateRecord.consecutiveAirFrames} stillMs=${stillMs.toFixed(1)} coyoteMs=${jumpState.coyoteLeftMs.toFixed(1)} lockMs=${jumpState.postJumpLockLeftMs.toFixed(1)} consumed=${jumpState.jumpConsumed}`,
          );
        }

        // ── Jump resolution ───────────────────────────────────────────────────
        if (canApplyJump(jumpState, isOnGround)) {
          physics.setLinearVelocity(slot, targetVx, -jumpVelocity);
          markJumpApplied(jumpState, movement.postJumpLockMs);

          if (debug) {
            console.log(
              `[PlatformerMovementSystem] jump applied slot=${slot} targetVx=${targetVx.toFixed(3)} jumpVy=${(-jumpVelocity).toFixed(3)} lockMs=${movement.postJumpLockMs.toFixed(1)}`,
            );
          }
        } else if (debug && intent.jumpJustPressed) {
          const reason =
            jumpState.postJumpLockLeftMs > 0
              ? `post_jump_lock(${jumpState.postJumpLockLeftMs.toFixed(1)}ms)`
              : jumpState.jumpConsumed
                ? 'jump_already_consumed'
                : 'not_grounded_or_no_coyote';
          console.log(
            `[PlatformerMovementSystem] jump blocked slot=${slot} reason=${reason} grounded=${isOnGround} coyoteMs=${jumpState.coyoteLeftMs.toFixed(1)} bufferMs=${jumpState.jumpBufferLeftMs.toFixed(1)}`,
          );
        }
      }
    },
  };
});
