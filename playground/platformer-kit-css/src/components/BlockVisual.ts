import { defineComponent, Types } from '@gwenengine/core';

/**
 * Pixel-space rectangle used by block UI entities.
 */
export const BlockVisual = defineComponent({
  name: 'BlockVisual',
  schema: {
    x: Types.f32,
    y: Types.f32,
    w: Types.f32,
    h: Types.f32,
  },
});
