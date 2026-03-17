import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

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
