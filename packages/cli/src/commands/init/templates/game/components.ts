/**
 * Template factory for `src/components/game.ts` in the scaffolded project.
 *
 * Defines all ECS components used by the Starfield Shooter landing game.
 * Components are defined with strongly-typed schemas — no `any` allowed.
 */

/**
 * Returns the `src/components/game.ts` source for the landing game.
 *
 * @returns The TypeScript source string (with trailing newline).
 */
export function componentsTemplate(): string {
  return `import { defineComponent, Types } from '@gwenjs/core'

// ─── Shared spatial components ────────────────────────────────────────────────

/** 2-D world position in pixels (centre of the entity). */
export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 },
})

/** Linear velocity in pixels per second. */
export const Velocity = defineComponent({
  name: 'velocity',
  schema: { x: Types.f32, y: Types.f32 },
})

/** Axis-aligned bounding box half-extents used for collision detection. */
export const Size = defineComponent({
  name: 'size',
  schema: { w: Types.f32, h: Types.f32 },
})

// ─── Tag / state components ───────────────────────────────────────────────────

/** Marks the entity as the player-controlled ship. */
export const PlayerTag = defineComponent({
  name: 'playerTag',
  schema: { active: Types.u8 },
})

/**
 * Weapon cooldown state for entities that can shoot.
 *
 * @field cooldown - Seconds between shots.
 * @field timer    - Countdown to next allowed shot (≤ 0 means ready).
 */
export const Shooter = defineComponent({
  name: 'shooter',
  schema: { cooldown: Types.f32, timer: Types.f32 },
})

/** Marks the entity as an asteroid (enemy). Carries rendering radius. */
export const AsteroidTag = defineComponent({
  name: 'asteroidTag',
  schema: { radius: Types.f32, rotation: Types.f32, rotSpeed: Types.f32 },
})

/** Marks the entity as a player bullet. Carries remaining lifetime. */
export const BulletTag = defineComponent({
  name: 'bulletTag',
  schema: { lifetime: Types.f32 },
})

/** Accumulated player score — lives on the single player entity. */
export const Score = defineComponent({
  name: 'score',
  schema: { value: Types.i32, lives: Types.i32, invincible: Types.f32 },
})
`
}
