import { definePrefab } from '@djodjonx/gwen-engine-core';
import type { EngineAPI, EntityId } from '@djodjonx/gwen-engine-core';
import { SENSOR_ID_FOOT, type PhysicsColliderDef } from '@djodjonx/gwen-plugin-physics2d/core';
import {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '../components/PlatformerController.js';
import { PlatformerIntent } from '../components/PlatformerIntent.js';
import {
  DEFAULT_PIXELS_PER_METER,
  DEFAULT_PLATFORMER_UNITS,
  type PlatformerUnits,
} from '../units.js';
import { type PlatformerKitComponents, resolveComponent } from '../plugin.js';

/**
 * Definition for a simplified collider in pixels.
 */
export interface ColliderPixelDef {
  /** Total width in pixels. */
  w: number;
  /** Total height in pixels. */
  h: number;
  /** Vertical offset from the center in pixels. Positive is down. */
  offset?: number;
  /** Optional ID for the collider. */
  id?: number | string;
}

/**
 * Options for creating a platformer player prefab.
 */
export interface PlayerPrefabOptions {
  /** Prefab name — used by api.prefabs.instantiate(). Default: 'PlatformerPlayer' */
  name?: string;
  /** Gameplay units used by movement fields. @default 'pixels' */
  units?: PlatformerUnits;
  /** Conversion ratio used when `units` is `pixels`. @default 50 */
  pixelsPerMeter?: number;
  /** Max horizontal speed (depends on `units`). Default: 300 */
  speed?: number;
  /** Vertical jump impulse (depends on `units`). Default: 500 */
  jumpForce?: number;
  /** Coyote time window (ms). Default: 110 */
  coyoteMs?: number;
  /** Jump buffer window (ms). Default: 110 */
  jumpBufferMs?: number;
  /** Max fall speed cap (depends on `units`). Default: 600 */
  maxFallSpeed?: number;

  /**
   * Simplified collider configuration in pixels.
   * The kit will automatically convert these to physics meters based on project PPM.
   */
  colliders?: {
    /** Main solid body. Default: 30x30 px */
    body?: { w: number; h: number };
    /** Foot sensor required for grounded check. Default: 26x4 px at offset 16 */
    foot?: ColliderPixelDef;
    /** Optional head sensor. */
    head?: ColliderPixelDef;
  };

  /**
   * Advanced: Local component overrides for this prefab.
   */
  components?: Partial<PlatformerKitComponents>;

  /**
   * Additional colliders to add to the player (e.g., hitboxes, interaction zones).
   * These use the standard Physics2D collider definition format.
   */
  extraColliders?: PhysicsColliderDef[];

  /**
   * Raw physics body extensions forwarded to the plugin.
   * If provided, these will merge with or override the default kit physics config.
   */
  physics?: Record<string, unknown>;

  /**
   * Extension hook — called after entity creation, before returning the id.
   * Use this to add custom project-specific components.
   */
  onCreated?: (api: EngineAPI, id: EntityId) => void;
}

/**
 * Creates a PrefabDefinition for a platformer player entity.
 *
 * This factory generates a complete player setup including movement logic,
 * input intentions, and a physical representation with default colliders.
 *
 * Automatically Adds:
 * - Position (from resolveComponent)
 * - PlatformerController (movement config)
 * - PlatformerIntent (movement intentions)
 * - Physics Extension (Body + Colliders)
 *
 * @example
 * ```ts
 * const PlayerPrefab = createPlayerPrefab({
 *   speed: 400,
 *   jumpForce: 600,
 *   colliders: { body: { w: 20, h: 30 } }
 * });
 * api.prefabs.register(PlayerPrefab);
 * ```
 */
export function createPlayerPrefab(options: PlayerPrefabOptions = {}) {
  const d = PLATFORMER_CONTROLLER_DEFAULTS;

  // 1. Prepare default colliders (in pixels, will be scaled by Physics2D plugin)
  const bodyHw = (options.colliders?.body?.w ?? 30) / 2;
  const bodyHh = (options.colliders?.body?.h ?? 30) / 2;

  const defaultColliders: PhysicsColliderDef[] = [
    // Main body collider
    {
      shape: 'box',
      hw: bodyHw,
      hh: bodyHh,
      friction: (options.physics?.friction as number) ?? 0,
      restitution: (options.physics?.restitution as number) ?? 0,
    },
    // Foot sensor (REQUIRED for PlatformerMovementSystem)
    {
      shape: 'box',
      hw: (options.colliders?.foot?.w ?? 26) / 2,
      hh: (options.colliders?.foot?.h ?? 4) / 2,
      offsetY: options.colliders?.foot?.offset ?? 16,
      isSensor: true,
      colliderId: SENSOR_ID_FOOT,
    },
  ];

  // Optional head sensor
  if (options.colliders?.head) {
    defaultColliders.push({
      shape: 'box',
      hw: options.colliders.head.w / 2,
      hh: options.colliders.head.h / 2,
      offsetY: options.colliders.head.offset ?? -16,
      isSensor: true,
      colliderId: options.colliders.head.id ?? 0x4ead,
    });
  }

  return definePrefab({
    name: options.name ?? 'PlatformerPlayer',
    extensions: {
      physics: {
        bodyType: 'dynamic',
        fixedRotation: true,
        colliders: [...defaultColliders, ...(options.extraColliders ?? [])],
        ...options.physics,
      },
    },
    create(api, x: number, y: number) {
      const id = api.createEntity();

      // Resolve the Position component (allows advanced user overrides)
      const PositionComponent = resolveComponent(api, 'position', options.components);
      api.addComponent(id, PositionComponent, { x, y });

      api.addComponent(id, PlatformerController, {
        units: options.units ?? d.units ?? DEFAULT_PLATFORMER_UNITS,
        pixelsPerMeter: options.pixelsPerMeter ?? d.pixelsPerMeter ?? DEFAULT_PIXELS_PER_METER,
        speed: options.speed ?? d.speed,
        jumpForce: options.jumpForce ?? d.jumpForce,
        coyoteMs: options.coyoteMs ?? d.coyoteMs,
        jumpBufferMs: options.jumpBufferMs ?? d.jumpBufferMs,
        maxFallSpeed: options.maxFallSpeed ?? d.maxFallSpeed,
      });

      api.addComponent(id, PlatformerIntent, {
        moveX: 0,
        jumpJustPressed: false,
        jumpPressed: false,
      });

      options.onCreated?.(api, id);
      return id;
    },
  });
}
