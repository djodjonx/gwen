import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const ColliderDef = defineComponent({
  name: 'collider',
  schema: { radius: Types.f32 }
});

export type Collider = InferComponent<typeof ColliderDef>;
