/**
 * Composants du Space Shooter
 * Utilisent le DSL defineComponent pour préparer la séparation WASM.
 */

import { defineComponent, Types, type InferComponent } from '@gwen/engine-core';

export const PositionDef = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});
export type Position = InferComponent<typeof PositionDef>;

export const VelocityDef = defineComponent({
  name: 'velocity',
  schema: { vx: Types.f32, vy: Types.f32 }
});
export type Velocity = InferComponent<typeof VelocityDef>;

export const HealthDef = defineComponent({
  name: 'health',
  schema: { current: Types.f32, max: Types.f32 }
});
export type Health = InferComponent<typeof HealthDef>;

export const TagDef = defineComponent({
  name: 'tag',
  schema: { type: Types.string } // 'player' | 'enemy' | 'bullet' | 'enemy-bullet'
});
export type EntityTag = 'player' | 'enemy' | 'bullet' | 'enemy-bullet';
export type Tag = InferComponent<typeof TagDef>;

export const ShootTimerDef = defineComponent({
  name: 'shootTimer',
  schema: { elapsed: Types.f32, cooldown: Types.f32 }
});
export type ShootTimer = InferComponent<typeof ShootTimerDef>;

export const ColliderDef = defineComponent({
  name: 'collider',
  schema: { radius: Types.f32 }
});
export type Collider = InferComponent<typeof ColliderDef>;

export const ScoreDef = defineComponent({
  name: 'score',
  schema: { value: Types.i32, lives: Types.i32 }
});
export type ScoreData = InferComponent<typeof ScoreDef>;

// Export as old COMPONENTS map structure to minimize refactor scope initially
export const COMPONENTS = {
  POSITION: PositionDef,
  VELOCITY: VelocityDef,
  HEALTH: HealthDef,
  TAG: TagDef,
  SHOOT_TIMER: ShootTimerDef,
  COLLIDER: ColliderDef,
  SCORE: ScoreDef,
} as const;
