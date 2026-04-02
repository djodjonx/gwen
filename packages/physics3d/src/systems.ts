/**
 * Reusable systems for the Physics3D plugin.
 *
 * These systems use `definePlugin` to expose simple stateful plugins
 * that can be composed into a game's plugin list.
 */

import { definePlugin } from '@gwenjs/kit';
import type { GwenEngine } from '@gwenjs/core';
import type { Physics3DAPI } from './types.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Stable sensor id for the foot (ground-detection) sensor. */
export const SENSOR_ID_FOOT = 0xf007;

/** Stable sensor id for the head (ceiling-detection) sensor. */
export const SENSOR_ID_HEAD = 0xf008;

// ─── Options ──────────────────────────────────────────────────────────────────

/**
 * Options for `createPhysicsKinematicSyncSystem`.
 */
export interface PhysicsKinematicSyncSystemOptions {
  /**
   * ECS component name that holds `{ x, y, z }` transform data.
   * @default 'transform3d'
   */
  positionComponent?: string;
  /**
   * ECS component name that holds `{ x, y, z, w }` rotation data.
   * Rotation sync is skipped when this is `undefined`.
   * @default undefined
   */
  rotationComponent?: string;
}

// ─── Systems ──────────────────────────────────────────────────────────────────

/**
 * Create a reusable plugin that syncs the ECS `Transform3D` component
 * into Rapier3D kinematic body positions each frame.
 *
 * Only entities that have both a registered kinematic body AND the configured
 * position component are affected.
 *
 * @param options - Optional component names and conversion settings.
 * @returns A `definePlugin` class ready to be instantiated and registered.
 *
 * @example
 * ```ts
 * engine.use(createPhysicsKinematicSyncSystem());
 * ```
 */
export function createPhysicsKinematicSyncSystem(options: PhysicsKinematicSyncSystemOptions = {}) {
  const positionComponent = options.positionComponent ?? 'transform3d';
  const rotationComponent = options.rotationComponent;

  return definePlugin(() => {
    let physics: Physics3DAPI | null = null;
    let _engine: GwenEngine | null = null;

    return {
      name: 'Physics3DKinematicSyncSystem',

      setup(engine: GwenEngine): void {
        _engine = engine;
        physics = ((engine as any).tryInject('physics3d') as Physics3DAPI | undefined) ?? null;
      },

      onBeforeUpdate(): void {
        if (!physics || !_engine) return;

        const entities = [...(_engine as any).createLiveQuery([positionComponent])] as any[];
        for (const entityId of entities) {
          if (!physics.hasBody(entityId)) continue;
          if (physics.getBodyKind(entityId) !== 'kinematic') continue;

          const pos = (
            (_engine as any).getComponent as (
              id: any,
              name: any,
            ) => { x: number; y: number; z: number } | null
          )(entityId, positionComponent);
          if (!pos) continue;

          const rot = rotationComponent
            ? ((
                (_engine as any).getComponent as (
                  id: any,
                  name: any,
                ) => { x: number; y: number; z: number; w: number } | null
              )(entityId, rotationComponent) ?? undefined)
            : undefined;

          physics.setKinematicPosition(entityId, pos, rot);
        }
      },

      teardown(): void {
        physics = null;
        _engine = null;
      },
    };
  });
}
