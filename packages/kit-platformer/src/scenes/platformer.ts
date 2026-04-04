import { defineScene } from '../plugin/scene-utils.js';
import type { SceneCallbackApi, LocalPluginEntry } from '../plugin/scene-utils.js';
import { PlatformerInputSystem } from '../systems/PlatformerInputSystem.js';
import { PlatformerMovementSystem } from '../systems/PlatformerMovementSystem.js';
import {
  DEFAULT_PIXELS_PER_METER,
  DEFAULT_PLATFORMER_UNITS,
  toPhysicsScalar,
  type PlatformerUnits,
} from '../plugin/units.js';
import { type PlatformerKitComponents } from '../plugin/index.js';

/**
 * Options for creating a turnkey platformer scene.
 */
export interface PlatformerSceneOptions {
  /** Scene name — used by scene.load(). Default: 'Main' */
  name?: string;
  /** Gravity force (depends on `units`). Default: 20 */
  gravity?: number;
  /** Units for `gravity`. @default 'pixels' */
  units?: PlatformerUnits;
  /** Conversion ratio used when `units` is `pixels`. @default 50 */
  pixelsPerMeter?: number;
  /** Custom logic called when entering the scene. */
  onEnter?(api: SceneCallbackApi): void | Promise<void>;
  /** Custom logic called when exiting the scene. */
  onExit?(api: SceneCallbackApi): void | Promise<void>;
  /** Scene-specific systems (in addition to platformer defaults). */
  systems?: LocalPluginEntry[];
  /**
   * Advanced: Local component overrides for this scene.
   */
  components?: Partial<PlatformerKitComponents>;
  /**
   * Scene extension data.
   * Consumed by plugins (e.g. Physics2D) to configure scene-wide behavior.
   */
  extensions?: Record<string, unknown>;
}

/**
 * Creates a standard 2D platformer scene with default systems.
 *
 * Automatically registers:
 * - PlatformerInputSystem (InputMapper → Intent)
 * - PlatformerMovementSystem (Intent → Physics)
 * - Sets physics gravity via `physics.setGravity()` if the service exists.
 *
 * @example
 * ```ts
 * export const MainScene = createPlatformerScene({
 *   onEnter(api) {
 *     api.prefabs.instantiate('Player', 100, 200);
 *   }
 * });
 * ```
 */
export function createPlatformerScene(options: PlatformerSceneOptions = {}) {
  return defineScene({
    ...options,
    name: options.name ?? 'Main',
    systems: [PlatformerInputSystem, PlatformerMovementSystem, ...(options.systems ?? [])],

    onEnter(api) {
      // `physics` is an optional service — may not be registered in all scenes.
      // We access only the `setGravity` method if it exists.
      const physics = api.services.has('physics')
        ? (api.services.get('physics') as { setGravity?: (x: number, y: number) => void } | null)
        : null;
      const units = options.units ?? DEFAULT_PLATFORMER_UNITS;
      const pixelsPerMeter = options.pixelsPerMeter ?? DEFAULT_PIXELS_PER_METER;
      const gravity = toPhysicsScalar(options.gravity ?? 20, units, pixelsPerMeter);
      physics?.setGravity?.(0, gravity);
      return options.onEnter?.(api);
    },

    onExit(api) {
      return options.onExit?.(api);
    },
  });
}
