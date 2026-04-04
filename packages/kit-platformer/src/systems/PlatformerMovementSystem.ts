import type { EntityId, GwenEngine, GwenPlugin } from '@gwenjs/core';
import { createPlatformerGroundedSystem } from '@gwenjs/physics2d/core';
import type { Physics2DAPI } from '@gwenjs/physics2d/core';
import {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '../components/PlatformerController';
import { PlatformerIntent } from '../components/PlatformerIntent';
import {
  canApplyJump,
  createJumpResolverState,
  markJumpApplied,
  stepJumpResolver,
  tryConfirmLanding,
} from './platformer/jumpResolver';
import {
  createGroundHysteresisState,
  resolveGroundedWithHysteresis,
} from './platformer/groundHysteresis';
import { toPhysicsScalar, type PlatformerUnits } from '../plugin/units';

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

function pickNumber(value: number | undefined, fallback: number): number {
  if (isValidNumber(value)) return value;
  return fallback;
}

type ControllerLike = {
  speed?: number;
  jumpVelocity?: number;
  maxFallSpeed?: number;
  jumpCoyoteMs?: number;
  jumpBufferWindowMs?: number;
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
    speed: pickNumber(ctrl.speed, defaults.speed),
    jumpVelocity: pickNumber(ctrl.jumpVelocity, defaults.jumpVelocity),
    maxFallSpeed: pickNumber(ctrl.maxFallSpeed, defaults.maxFallSpeed),
    jumpCoyoteMs: pickNumber(ctrl.jumpCoyoteMs, defaults.jumpCoyoteMs),
    jumpBufferWindowMs: pickNumber(ctrl.jumpBufferWindowMs, defaults.jumpBufferWindowMs),
    groundEnterFrames: pickNumber(ctrl.groundEnterFrames, defaults.groundEnterFrames),
    groundExitFrames: pickNumber(ctrl.groundExitFrames, defaults.groundExitFrames),
    postJumpLockMs: pickNumber(ctrl.postJumpLockMs, defaults.postJumpLockMs),
  };
}

/**
 * Factory that creates a system reading PlatformerIntent and applying movement via Physics2DAPI.
 */
export function PlatformerMovementSystem(): GwenPlugin {
  const RESTING_VY_EPSILON = 0.08;
  const RESTING_DY_EPSILON = 0.0015;
  const RESTING_GROUNDED_DELAY_MS = 120;
  const RESTING_LANDING_CONFIRM_MS = 160;

  let physics: Physics2DAPI;
  let grounded: ReturnType<typeof createPlatformerGroundedSystem>;
  let debug = false;
  let debugTick = 0;
  let _engine: GwenEngine | null = null;

  const groundStates = new Map<bigint, ReturnType<typeof createGroundHysteresisState>>();
  const jumpStates = new Map<bigint, ReturnType<typeof createJumpResolverState>>();
  const nearStillAirMs = new Map<bigint, number>();
  const lastYByEntity = new Map<bigint, number>();

  return {
    name: 'PlatformerMovementSystem',

    setup(engine: GwenEngine): void {
      _engine = engine;
      physics = engine.inject('physics') as Physics2DAPI;
      grounded = createPlatformerGroundedSystem({ physics });
      debug = physics.isDebugEnabled?.() ?? false;

      engine.hooks.hook('entity:destroy', (eid: EntityId) => {
        groundStates.delete(eid);
        jumpStates.delete(eid);
        nearStillAirMs.delete(eid);
        lastYByEntity.delete(eid);
      });
    },

    onUpdate(_apiOrDt: unknown, dt?: number): void {
      // V2 engine calls onUpdate(dt) directly; dt is the first argument
      const deltaTime = typeof _apiOrDt === 'number' ? _apiOrDt : (dt ?? 0);
      const dtMs = deltaTime * 1000;
      if (!_engine) return;

      const entities = [..._engine.createLiveQuery([PlatformerController, PlatformerIntent])].map(
        (a) => a.id,
      );

      for (const eid of entities) {
        const ctrl =
          _engine!.getComponent(eid, PlatformerController) ?? PLATFORMER_CONTROLLER_DEFAULTS;
        const intent = _engine!.getComponent(eid, PlatformerIntent);
        if (!intent) continue;

        const vel = physics.getLinearVelocity(eid);
        if (!vel) continue;

        // Horizontal movement
        const movement = resolveMovementConfig(ctrl);
        const units = normalizeUnits(ctrl.units);
        const speed = toPhysicsScalar(movement.speed, units, ctrl.pixelsPerMeter);
        const jumpVelocity = toPhysicsScalar(movement.jumpVelocity, units, ctrl.pixelsPerMeter);
        const maxFallSpeed = toPhysicsScalar(movement.maxFallSpeed, units, ctrl.pixelsPerMeter);
        const targetVx = intent.moveX * speed;
        physics.setLinearVelocity(eid, targetVx, Math.max(vel.y, -maxFallSpeed));

        const sensorGrounded = grounded.isGrounded(eid);
        const groundState = grounded.getSensorState(eid);
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

        const pos = physics.getPosition?.(eid) ?? null;
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
            `[PlatformerMovementSystem] jump request entity=${String(eid)} grounded=${isOnGround}(sensor=${sensorGrounded},inferred=${inferredGrounded}) contactCount=${groundState.contactCount} coyoteMs=${jumpState.coyoteLeftMs.toFixed(1)} bufferMs=${jumpState.jumpBufferLeftMs.toFixed(1)} lockMs=${jumpState.postJumpLockLeftMs.toFixed(1)} consumed=${jumpState.jumpConsumed} vy=${vel.y.toFixed(3)}`,
          );
        }

        if (debug && debugTick++ % 30 === 0) {
          console.log(
            `[PlatformerMovementSystem] state entity=${String(eid)} vy=${vel.y.toFixed(3)} grounded=${isOnGround}(sensor=${sensorGrounded},inferred=${inferredGrounded}) contacts=${groundState.contactCount} enterFrames=${groundStateRecord.consecutiveGroundFrames} exitFrames=${groundStateRecord.consecutiveAirFrames} stillMs=${stillMs.toFixed(1)} coyoteMs=${jumpState.coyoteLeftMs.toFixed(1)} lockMs=${jumpState.postJumpLockLeftMs.toFixed(1)} consumed=${jumpState.jumpConsumed}`,
          );
        }

        // ── Jump resolution ───────────────────────────────────────────────────
        if (canApplyJump(jumpState, isOnGround)) {
          physics.setLinearVelocity(eid, targetVx, -jumpVelocity);
          markJumpApplied(jumpState, movement.postJumpLockMs);

          if (debug) {
            console.log(
              `[PlatformerMovementSystem] jump applied entity=${String(eid)} targetVx=${targetVx.toFixed(3)} jumpVy=${(-jumpVelocity).toFixed(3)} lockMs=${movement.postJumpLockMs.toFixed(1)}`,
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
            `[PlatformerMovementSystem] jump blocked entity=${String(eid)} reason=${reason} grounded=${isOnGround} coyoteMs=${jumpState.coyoteLeftMs.toFixed(1)} bufferMs=${jumpState.jumpBufferLeftMs.toFixed(1)}`,
          );
        }
      }
    },
  };
}
