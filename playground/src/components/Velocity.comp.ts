import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const VelocityDef = defineComponent({
  name: 'velocity',
  schema: { vx: Types.f32, vy: Types.f32 }
});

export type Velocity = InferComponent<typeof VelocityDef>;
