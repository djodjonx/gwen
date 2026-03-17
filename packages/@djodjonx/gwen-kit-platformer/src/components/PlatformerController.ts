import { defineComponent, Types } from '@djodjonx/gwen-engine-core';
import {
  DEFAULT_PIXELS_PER_METER,
  DEFAULT_PLATFORMER_UNITS,
  type PlatformerUnits,
} from '../units.js';

/**
 * Physics and movement configuration for a platformer entity.
 *
 * All fields have sensible defaults in PLATFORMER_CONTROLLER_DEFAULTS.
 * Override per-entity via createPlayerPrefab(options) or addComponent() directly.
 */
export const PlatformerController = defineComponent({
  name: 'PlatformerController',
  schema: {
    units: Types.string, // 'pixels' or 'meters'. Default: 'pixels'
    pixelsPerMeter: Types.f32, // Conversion ratio when units='pixels'. Default: 50
    speed: Types.f32, // Max horizontal speed (depends on `units`). Default: 300
    jumpVelocity: Types.f32, // Vertical jump velocity (depends on `units`). Default: 500
    jumpCoyoteMs: Types.f32, // Jump window after leaving ground (ms). Default: 110
    jumpBufferWindowMs: Types.f32, // Jump input memory before landing (ms). Default: 110
    groundEnterFrames: Types.f32, // Frames needed to confirm grounded from sensor active.
    groundExitFrames: Types.f32, // Frames needed to confirm airborne from sensor inactive.
    postJumpLockMs: Types.f32, // Short jump lockout to absorb immediate reland jitter.
    // Deprecated aliases kept for compatibility.
    jumpForce: Types.f32,
    coyoteMs: Types.f32,
    jumpBufferMs: Types.f32,
    maxFallSpeed: Types.f32, // Maximum fall speed cap (depends on `units`). Default: 600
  },
});

export type PlatformerControllerData = {
  units: PlatformerUnits;
  pixelsPerMeter: number;
  speed: number;
  jumpVelocity: number;
  jumpCoyoteMs: number;
  jumpBufferWindowMs: number;
  groundEnterFrames: number;
  groundExitFrames: number;
  postJumpLockMs: number;
  /** @deprecated Use `jumpVelocity`. */
  jumpForce: number;
  /** @deprecated Use `jumpCoyoteMs`. */
  coyoteMs: number;
  /** @deprecated Use `jumpBufferWindowMs`. */
  jumpBufferMs: number;
  maxFallSpeed: number;
};

/** Ready-to-use defaults — functional without any configuration. */
export const PLATFORMER_CONTROLLER_DEFAULTS: PlatformerControllerData = {
  units: DEFAULT_PLATFORMER_UNITS,
  pixelsPerMeter: DEFAULT_PIXELS_PER_METER,
  speed: 300,
  jumpVelocity: 500,
  jumpCoyoteMs: 110,
  jumpBufferWindowMs: 110,
  groundEnterFrames: 1,
  groundExitFrames: 4,
  postJumpLockMs: 80,
  // Deprecated aliases mirrored to avoid behavioral drift.
  jumpForce: 500,
  coyoteMs: 110,
  jumpBufferMs: 110,
  maxFallSpeed: 600,
};
