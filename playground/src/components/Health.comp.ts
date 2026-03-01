import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const HealthDef = defineComponent({
  name: 'health',
  schema: { current: Types.f32, max: Types.f32 }
});

export type Health = InferComponent<typeof HealthDef>;
