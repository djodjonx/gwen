export * from './Position.comp';
export * from './Velocity.comp';
export * from './Health.comp';
export * from './Tag.comp';
export * from './ShootTimer.comp';
export * from './Collider.comp';
export * from './Score.comp';

// Centralised object for easier imports
import { PositionDef } from './Position.comp';
import { VelocityDef } from './Velocity.comp';
import { HealthDef } from './Health.comp';
import { TagDef } from './Tag.comp';
import { ShootTimerDef } from './ShootTimer.comp';
import { ColliderDef } from './Collider.comp';
import { ScoreDef } from './Score.comp';

export const COMPONENTS = {
  POSITION: PositionDef,
  VELOCITY: VelocityDef,
  HEALTH: HealthDef,
  TAG: TagDef,
  SHOOT_TIMER: ShootTimerDef,
  COLLIDER: ColliderDef,
  SCORE: ScoreDef,
} as const;
