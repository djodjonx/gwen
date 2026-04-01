import { defineComponent, Types } from '@gwenengine/core';

/** Marker component used to identify the player entity. */
export const PlayerTag = defineComponent({
  name: 'PlayerTag',
  schema: {
    value: Types.i32,
  },
});
