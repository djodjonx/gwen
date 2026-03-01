import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const ScoreDef = defineComponent({
  name: 'score',
  schema: { value: Types.i32, lives: Types.i32 }
});

export type ScoreData = InferComponent<typeof ScoreDef>;
