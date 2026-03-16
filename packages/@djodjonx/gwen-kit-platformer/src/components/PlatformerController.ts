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
    jumpForce: Types.f32, // Vertical impulse on jump (depends on `units`). Default: 500
    coyoteMs: Types.f32, // Jump window after leaving ground (ms). Default: 110
    jumpBufferMs: Types.f32, // Jump input memory before landing (ms). Default: 110
    maxFallSpeed: Types.f32, // Maximum fall speed cap (depends on `units`). Default: 600
  },
});

export type PlatformerControllerData = {
  units: PlatformerUnits;
  pixelsPerMeter: number;
  speed: number;
  jumpForce: number;
  coyoteMs: number;
  jumpBufferMs: number;
  maxFallSpeed: number;
};

/** Ready-to-use defaults — functional without any configuration. */
export const PLATFORMER_CONTROLLER_DEFAULTS: PlatformerControllerData = {
  units: DEFAULT_PLATFORMER_UNITS,
  pixelsPerMeter: DEFAULT_PIXELS_PER_METER,
  speed: 300,
  jumpForce: 500,
  coyoteMs: 110,
  jumpBufferMs: 110,
  maxFallSpeed: 600,
};
