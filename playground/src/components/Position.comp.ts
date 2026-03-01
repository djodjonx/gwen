import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const PositionDef = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});

export type Position = InferComponent<typeof PositionDef>;
