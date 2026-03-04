/**
 * Entity & component primitive types.
 *
 * Zero dependencies — these are the bedrock types that everything else imports.
 */

// ── Entity ────────────────────────────────────────────────────────────────────

/**
 * Packed entity identifier: `(generation << 20) | (index & 0xFFFFF)`.
 *
 * The generation counter detects use-after-free: when an entity slot is reused,
 * the generation increments and any cached EntityId becomes stale.
 */
export type EntityId = number;

// ── Component ─────────────────────────────────────────────────────────────────

/** String name identifying a component type (e.g. `'Transform'`, `'Velocity'`). */
export type ComponentType = string;

/**
 * Typed accessor for a single component type.
 * Useful for building higher-level helpers on top of the raw ECS.
 */
export interface ComponentAccessor<T> {
  /**
   * Read the component data for `entityId`.
   * @returns The data, or `undefined` if the entity does not have this component.
   */
  get(entityId: EntityId): T | undefined;

  /**
   * Write (create or overwrite) the component data for `entityId`.
   * @param data New component value.
   */
  set(entityId: EntityId, data: T): void;

  /**
   * Return `true` if `entityId` has this component type.
   */
  has(entityId: EntityId): boolean;

  /**
   * Remove this component from `entityId`.
   * @returns `true` if the component existed and was removed.
   */
  remove(entityId: EntityId): boolean;
}

// ── Math primitives ───────────────────────────────────────────────────────────

/** 2D vector with `x` and `y` coordinates. Used for positions, velocities and sizes. */
export interface Vector2D {
  x: number;
  y: number;
}

/** RGBA color with components in the `[0, 1]` range. */
export interface Color {
  /** Red channel in `[0, 1]`. */
  r: number;
  /** Green channel in `[0, 1]`. */
  g: number;
  /** Blue channel in `[0, 1]`. */
  b: number;
  /** Alpha channel in `[0, 1]` — `0` is fully transparent, `1` is fully opaque. */
  a: number;
}
