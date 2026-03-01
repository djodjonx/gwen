/**
 * Composants du Space Shooter
 * Définis avec defineComponent() — typage automatique.
 */

import { defineComponent, Types } from '@gwen/engine-core';

export const Position   = defineComponent({ name: 'position',    schema: { x: Types.f32, y: Types.f32 } });
export const Velocity   = defineComponent({ name: 'velocity',    schema: { vx: Types.f32, vy: Types.f32 } });
export const Tag        = defineComponent({ name: 'tag',         schema: { type: Types.string } });
export const Collider   = defineComponent({ name: 'collider',    schema: { radius: Types.f32 } });
export const Health     = defineComponent({ name: 'health',      schema: { hp: Types.i32 } });
export const ShootTimer = defineComponent({ name: 'shoot-timer', schema: { elapsed: Types.f32, cooldown: Types.f32 } });
export const Score      = defineComponent({ name: 'score',       schema: { value: Types.i32, lives: Types.i32 } });

// Types inférés automatiquement — pas besoin de les écrire à la main
export type PositionData   = { x: number; y: number };
export type VelocityData   = { vx: number; vy: number };
export type TagData        = { type: 'player' | 'enemy' | 'bullet' | 'enemy-bullet' | 'score' };
export type ColliderData   = { radius: number };
export type HealthData     = { hp: number };
export type ShootTimerData = { elapsed: number; cooldown: number };
export type ScoreData      = { value: number; lives: number };
