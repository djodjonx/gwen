import { definePrefab } from '../scene-utils.js';
import type { PrefabCallbackApi } from '../scene-utils.js';
import type { EntityId } from '@gwenengine/core';
import { SENSOR_ID_FOOT, type PhysicsColliderDef } from '@gwenengine/physics2d/core';
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

export interface ColliderPixelDef {
  w: number;
  h: number;
  offset?: number;
  id?: number;
}

export interface PlayerPrefabOptions {
  name?: string;
  units?: PlatformerUnits;
  pixelsPerMeter?: number;
  speed?: number;
  jumpVelocity?: number;
  jumpCoyoteMs?: number;
  jumpBufferWindowMs?: number;
  groundEnterFrames?: number;
  groundExitFrames?: number;
  postJumpLockMs?: number;
  maxFallSpeed?: number;
  colliders?: {
    body?: { w: number; h: number };
    foot?: ColliderPixelDef;
    head?: ColliderPixelDef;
  };
  components?: Partial<PlatformerKitComponents>;
  extraColliders?: PhysicsColliderDef[];
  physics?: Record<string, unknown>;
  onCreated?: (api: PrefabCallbackApi, id: EntityId) => void;
}

export function createPlayerPrefab(options: PlayerPrefabOptions = {}) {
  const d = PLATFORMER_CONTROLLER_DEFAULTS;

  const bodyHw = (options.colliders?.body?.w ?? 30) / 2;
  const bodyHh = (options.colliders?.body?.h ?? 30) / 2;
  const footHw = (options.colliders?.foot?.w ?? 26) / 2;
  const footHh = (options.colliders?.foot?.h ?? 4) / 2;
  const footOffsetPx = options.colliders?.foot?.offset ?? bodyHh + footHh;

  const defaultColliders: PhysicsColliderDef[] = [
    {
      shape: 'box',
      hw: bodyHw,
      hh: bodyHh,
      friction: (options.physics?.friction as number) ?? 0,
      restitution: (options.physics?.restitution as number) ?? 0,
    },
    {
      shape: 'box',
      hw: footHw,
      hh: footHh,
      offsetY: footOffsetPx,
      isSensor: true,
      colliderId: SENSOR_ID_FOOT,
    },
  ];

  if (options.colliders?.head) {
    const headHw = options.colliders.head.w / 2;
    const headHh = options.colliders.head.h / 2;
    const headOffsetPx = options.colliders.head.offset ?? -(bodyHh + headHh);

    defaultColliders.push({
      shape: 'box',
      hw: headHw,
      hh: headHh,
      offsetY: headOffsetPx,
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
      const PositionComponent = resolveComponent(api, 'position', options.components);
      api.addComponent(id, PositionComponent, { x, y });

      api.addComponent(id, PlatformerController, {
        units: options.units ?? d.units ?? DEFAULT_PLATFORMER_UNITS,
        pixelsPerMeter: options.pixelsPerMeter ?? d.pixelsPerMeter ?? DEFAULT_PIXELS_PER_METER,
        speed: options.speed ?? d.speed,
        jumpVelocity: options.jumpVelocity ?? d.jumpVelocity,
        jumpCoyoteMs: options.jumpCoyoteMs ?? d.jumpCoyoteMs,
        jumpBufferWindowMs: options.jumpBufferWindowMs ?? d.jumpBufferWindowMs,
        groundEnterFrames: options.groundEnterFrames ?? d.groundEnterFrames,
        groundExitFrames: options.groundExitFrames ?? d.groundExitFrames,
        postJumpLockMs: options.postJumpLockMs ?? d.postJumpLockMs,
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
