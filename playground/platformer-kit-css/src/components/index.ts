import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

/**
 * Project-specific components.
 * Note: 'position' is now imported directly from the Platformer Kit.
 */

export const Velocity = defineComponent('Velocity', () => ({
  schema: {
    x: Types.f32,
    y: Types.f32,
  },
}));

export const Health = defineComponent('Health', () => ({
  schema: {
    current: Types.i32,
    max: Types.i32,
  },
}));
