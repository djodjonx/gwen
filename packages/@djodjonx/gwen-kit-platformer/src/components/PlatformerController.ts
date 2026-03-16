import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

/**
 * Physics and movement configuration for a platformer entity.
 *
 * All fields have sensible defaults in PLATFORMER_CONTROLLER_DEFAULTS.
 * Override per-entity via createPlayerPrefab(options) or addComponent() directly.
 */
export const PlatformerController = defineComponent({
  name: 'PlatformerController',
  schema: {
    speed: Types.f32, // Max horizontal speed (px/s). Default: 300
    jumpForce: Types.f32, // Vertical impulse on jump (px/s). Default: 500
    coyoteMs: Types.f32, // Jump window after leaving ground (ms). Default: 110
    jumpBufferMs: Types.f32, // Jump input memory before landing (ms). Default: 110
    maxFallSpeed: Types.f32, // Maximum fall speed cap (px/s). Default: 600
  },
});

export type PlatformerControllerData = {
  speed: number;
  jumpForce: number;
  coyoteMs: number;
  jumpBufferMs: number;
  maxFallSpeed: number;
};

/** Ready-to-use defaults — functional without any configuration. */
export const PLATFORMER_CONTROLLER_DEFAULTS: PlatformerControllerData = {
  speed: 300,
  jumpForce: 500,
  coyoteMs: 110,
  jumpBufferMs: 110,
  maxFallSpeed: 600,
};
