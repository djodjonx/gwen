import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const ShootTimerDef = defineComponent({
  name: 'shootTimer',
  schema: { elapsed: Types.f32, cooldown: Types.f32 }
});

export type ShootTimer = InferComponent<typeof ShootTimerDef>;
