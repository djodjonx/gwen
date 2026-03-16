import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

/**
 * Abstract movement intentions — source-agnostic.
 *
 * Written by : PlatformerInputSystem  (InputMapper → Intent)
 * Read by    : PlatformerMovementSystem (Intent → Physics)
 *
 * Decoupling benefit: AI, netcode, or replay systems write to PlatformerIntent
 * using the same interface as player input — no fork of PlatformerMovementSystem.
 */
export const PlatformerIntent = defineComponent({
  name: 'PlatformerIntent',
  schema: {
    moveX: Types.f32, // -1.0 (left) to 1.0 (right)
    jumpJustPressed: Types.bool, // true on the first frame of jump input
    jumpPressed: Types.bool, // true while jump button is held
  },
});
