import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

/**
 * Standard position component used by the Platformer Kit.
 *
 * Registered under the name 'position' to be compatible with
 * Physics2D and other built-in plugins.
 *
 * Fields:
 * - x: Horizontal position in world pixels.
 * - y: Vertical position in world pixels.
 */
export const Position = defineComponent({
  name: 'position',
  schema: {
    x: Types.f32,
    y: Types.f32,
  },
});
