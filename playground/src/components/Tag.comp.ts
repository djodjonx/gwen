import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const TagDef = defineComponent({
  name: 'tag',
  schema: { type: Types.string } // 'player' | 'enemy' | 'bullet' | 'enemy-bullet'
});

export type EntityTag = 'player' | 'enemy' | 'bullet' | 'enemy-bullet';
export type Tag = InferComponent<typeof TagDef>;
