import { defineComponent, Types } from '@gwen/engine-core';

/**
 * Exemples de composants.
 * Utilisez defineComponent() pour définir vos composants avec typage automatique.
 */

export const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});

export const Velocity = defineComponent('Velocity', {
  x: Types.f32,
  y: Types.f32,
});

export const Health = defineComponent('Health', {
  current: Types.i32,
  max: Types.i32,
});

// Types inférés automatiquement — intellisense complet
// export type PositionData = InferComponent<typeof Position>;
// → { x: number, y: number }

