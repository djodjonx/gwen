/**
 * Composants du Space Shooter
 * Définis comme des types TypeScript simples,
 * stockés dans le ComponentRegistry de l'ECS.
 */

// Position dans le monde
export interface Position {
  x: number;
  y: number;
}

// Vélocité (pixels/seconde)
export interface Velocity {
  vx: number;
  vy: number;
}

// Santé / vie
export interface Health {
  current: number;
  max: number;
}

// Tag pour identifier le type d'entité
export type EntityTag = 'player' | 'enemy' | 'bullet' | 'enemy-bullet';
export interface Tag {
  type: EntityTag;
}

// Timer de tir (cooldown)
export interface ShootTimer {
  elapsed: number;
  cooldown: number;
}

// Rayon de collision (cercle simple)
export interface Collider {
  radius: number;
}

// Score global (singleton sur une entité)
export interface ScoreData {
  value: number;
  lives: number;
}

// Clés de composant — évite les typos
export const COMPONENTS = {
  POSITION: 'position',
  VELOCITY: 'velocity',
  HEALTH: 'health',
  TAG: 'tag',
  SHOOT_TIMER: 'shootTimer',
  COLLIDER: 'collider',
  SCORE: 'score',
} as const;
