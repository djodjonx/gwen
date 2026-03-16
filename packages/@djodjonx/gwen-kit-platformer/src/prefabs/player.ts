import { definePrefab } from '@djodjonx/gwen-engine-core';
import type { EngineAPI, EntityId } from '@djodjonx/gwen-engine-core';
import {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '../components/PlatformerController.js';
import { PlatformerIntent } from '../components/PlatformerIntent.js';

export interface PlayerPrefabOptions {
  /** Prefab name — used by api.prefabs.instantiate(). Default: 'PlatformerPlayer' */
  name?: string;
  /** Max horizontal speed (px/s). Default: 300 */
  speed?: number;
  /** Vertical jump impulse (px/s). Default: 500 */
  jumpForce?: number;
  /** Coyote time window (ms). Default: 110 */
  coyoteMs?: number;
  /** Jump buffer window (ms). Default: 110 */
  jumpBufferMs?: number;
  /** Max fall speed cap (px/s). Default: 600 */
  maxFallSpeed?: number;
  /**
   * Physics body extensions forwarded to the prefab extensions map.
   * Typed as Record<string, unknown> because this package is a library —
   * GwenPrefabExtensions is a global interface enriched by `gwen prepare`
   * only in consumer projects. The consumer gets full types via .gwen/gwen.d.ts.
   */
  physics?: Record<string, unknown>;
  /**
   * Extension hook — called after entity creation, before returning the id.
   * Use to add custom components without forking createPlayerPrefab.
   *
   * @example
   * createPlayerPrefab({
   *   onCreated(api, id) {
   *     api.addComponent(id, HealthComponent, { hp: 100 });
   *   }
   * })
   */
  onCreated?: (api: EngineAPI, id: EntityId) => void;
}

/**
 * Creates a PrefabDefinition for a platformer player entity.
 *
 * Adds:
 * - PlatformerController (movement config)
 * - PlatformerIntent (movement state, initialized to idle)
 * - Physics body extension (dynamic, fixedRotation)
 *
 * @example
 * const PlayerPrefab = createPlayerPrefab({ speed: 400, jumpForce: 600 });
 * api.prefabs.register(PlayerPrefab);
 * const id = api.prefabs.instantiate('PlatformerPlayer', 100, 200);
 */
export function createPlayerPrefab(options: PlayerPrefabOptions = {}) {
  const d = PLATFORMER_CONTROLLER_DEFAULTS;
  return definePrefab({
    name: options.name ?? 'PlatformerPlayer',
    extensions: {
      physics: {
        bodyType: 'dynamic',
        fixedRotation: true,
        ...options.physics,
      },
    },
    create(api, _x: number, _y: number) {
      const id = api.createEntity();

      api.addComponent(id, PlatformerController, {
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
