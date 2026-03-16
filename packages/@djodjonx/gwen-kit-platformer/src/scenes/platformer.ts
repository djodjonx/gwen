import { defineScene } from '@djodjonx/gwen-engine-core';
import type { EngineAPI } from '@djodjonx/gwen-engine-core';
import type { PluginEntry } from '@djodjonx/gwen-engine-core';
import { PlatformerInputSystem } from '../systems/PlatformerInputSystem.js';
import { PlatformerMovementSystem } from '../systems/PlatformerMovementSystem.js';

export interface PlatformerSceneOptions {
  /** Unique scene name. */
  name: string;
  /**
   * Vertical gravity (physics units). Default: 20.
   * Override with options.onEnter for conditional logic.
   */
  gravity?: number;
  /**
   * Systems executed BEFORE PlatformerInputSystem.
   * Use for: spawn logic, AI writing to PlatformerIntent, ground detection.
   */
  systemsBefore?: PluginEntry[];
  /**
   * Systems executed AFTER PlatformerMovementSystem.
   * Use for: animation, camera follow, HUD updates.
   */
  systemsAfter?: PluginEntry[];
  /**
   * Called in onEnter after default setup (gravity set, systems registered).
   * Use to spawn initial entities, configure the level, etc.
   */
  onEnter?: (api: EngineAPI) => void | Promise<void>;
  /** Called in onExit. Use to clean up scene-specific resources. */
  onExit?: (api: EngineAPI) => void | Promise<void>;
}

/**
 * Creates a Scene pre-configured for a 2D platformer.
 *
 * System order:
 *   systemsBefore → PlatformerInputSystem → PlatformerMovementSystem → systemsAfter
 *
 * SceneManager auto-resolves SystemFactory entries — no need to invoke factories.
 *
 * @example
 * // Level 1 — scene clé en main
 * export const GameScene = createPlatformerScene({
 *   name: 'Game',
 *   systemsAfter: [CameraSystem, AnimationSystem],
 *   async onEnter(api) {
 *     api.prefabs.instantiate('PlatformerPlayer', 100, 300);
 *   },
 * });
 */
export function createPlatformerScene(options: PlatformerSceneOptions) {
  return defineScene({
    name: options.name,
    systems: [
      ...(options.systemsBefore ?? []),
      PlatformerInputSystem, // 1. InputMapper → PlatformerIntent
      PlatformerMovementSystem, // 2. PlatformerIntent → Physics
      ...(options.systemsAfter ?? []),
    ],

    onEnter(api) {
      const physics = api.services.has('physics') ? (api.services.get('physics') as any) : null;
      physics?.setGravity?.(0, options.gravity ?? 20);
      return options.onEnter?.(api);
    },

    onExit(api) {
      return options.onExit?.(api);
    },
  });
}
