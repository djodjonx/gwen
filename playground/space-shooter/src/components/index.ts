import { defineComponent, Types } from '@gwenjs/core';
import type { InferComponent } from '@gwenjs/core';

/** 2-D world position in pixels (centre of the entity). */
export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 },
});

/** Linear velocity in pixels per second. */
export const Velocity = defineComponent({
  name: 'velocity',
  schema: { x: Types.f32, y: Types.f32 },
});

/** Axis-aligned bounding box half-extents (full width / height). */
export const Size = defineComponent({
  name: 'size',
  schema: { w: Types.f32, h: Types.f32 },
});

/** Hit points for the entity. */
export const Health = defineComponent({
  name: 'health',
  schema: { hp: Types.i32 },
});

/**
 * Weapon cooldown state.
 * @field cooldown - Seconds between shots.
 * @field timer    - Countdown to next allowed shot (< 0 means ready).
 */
export const Shooter = defineComponent({
  name: 'shooter',
  schema: { cooldown: Types.f32, timer: Types.f32 },
});

/** Marker component — identifies the player entity. */
export const PlayerTag = defineComponent({
  name: 'playerTag',
  schema: { active: Types.bool },
});

/**
 * Marker component — identifies an enemy entity and carries its downward
 * movement speed (pixels/second).
 */
export const EnemyTag = defineComponent({
  name: 'enemyTag',
  schema: { speed: Types.f32 },
});

/** Marker component — identifies a bullet fired by the player. */
export const PlayerBulletTag = defineComponent({
  name: 'playerBulletTag',
  schema: { active: Types.bool },
});

/** Marker component — identifies a bullet fired by an enemy. */
export const EnemyBulletTag = defineComponent({
  name: 'enemyBulletTag',
  schema: { active: Types.bool },
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type PositionData = InferComponent<typeof Position>;
export type VelocityData = InferComponent<typeof Velocity>;
export type SizeData = InferComponent<typeof Size>;
export type HealthData = InferComponent<typeof Health>;
export type ShooterData = InferComponent<typeof Shooter>;
export type EnemyTagData = InferComponent<typeof EnemyTag>;
