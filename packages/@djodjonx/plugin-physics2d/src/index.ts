/// <reference types="vite/client" />

/**
 * @djodjonx/gwen-plugin-physics2d
 *
 * 2D physics plugin for GWEN — powered by Rapier2D compiled to WASM.
 *
 * ## Usage
 * ```typescript
 * // gwen.config.ts
 * import { physics2D } from '@djodjonx/gwen-plugin-physics2d';
 *
 * export default defineConfig({
 *   plugins: [physics2D({ gravity: -9.81, maxEntities: 10_000 })],
 * });
 * ```
 *
 * ## Accessing the API in a plugin
 * ```typescript
 * onInit(api) {
 *   const physics = api.services.get('physics') as Physics2DAPI;
 *   const h = physics.addRigidBody(entityIndex, 'dynamic', x, y);
 *   physics.addBoxCollider(h, 0.5, 0.5);
 * }
 * ```
 */

import { definePlugin, loadWasmPlugin } from '@djodjonx/gwen-kit';
import { unpackEntityId } from '@djodjonx/gwen-engine-core';
import type {
  WasmBridge,
  MemoryRegion,
  EngineAPI,
  PluginDataBus,
  PluginChannel,
  GwenPluginMeta,
} from '@djodjonx/gwen-kit';

import type {
  Physics2DConfig,
  Physics2DAPI,
  Physics2DWasmModule,
  WasmPhysics2DPlugin,
  CollisionEvent,
  ColliderOptions,
  RigidBodyType,
  Physics2DPrefabExtension,
} from './types';
import { BODY_TYPE, readCollisionEventsFromBuffer } from './types';

// Re-export public types
export type {
  Physics2DConfig,
  Physics2DAPI,
  CollisionEvent,
  ColliderOptions,
  RigidBodyType,
  Physics2DPrefabExtension,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PIXELS_PER_METER = 50;

// ─── Plugin metadata ───────────────────────────────────────────────────────────

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    physics: { from: '@djodjonx/gwen-plugin-physics2d', exportName: 'Physics2DAPI' },
  },
};

// ─── Physics2DPlugin ──────────────────────────────────────────────────────────

/**
 * GWEN plugin that provides 2D rigid-body physics via Rapier2D.
 *
 * Uses the Plugin Data Bus for zero-SAB communication:
 * - "transform" channel: TS → Rapier (kinematic body positions)
 * - "events"    channel: Rapier → TS (collision events, binary ring buffer)
 */
export const Physics2DPlugin = definePlugin({
  name: 'Physics2D',
  meta: pluginMeta,
  provides: { physics: {} as Physics2DAPI },
  /**
   * Phantom type — consumed by `gwen prepare` to enrich `GwenPrefabExtensions`
   * with `{ physics: Physics2DPrefabExtension }`.
   * Values are never read at runtime.
   */
  extensions: {
    prefab: {} as Physics2DPrefabExtension,
  },
  wasm: {
    id: 'physics2d',
    /** No legacy SAB — Plugin Data Bus is used exclusively. */
    sharedMemoryBytes: 0,
    channels: [
      {
        name: 'transform',
        direction: 'read',
        strideBytes: 20, // pos_x, pos_y, rotation, scale_x, scale_y (5 × f32)
        bufferType: 'f32',
      } satisfies PluginChannel,
      {
        name: 'events',
        direction: 'write',
        bufferType: 'ring',
        capacityEvents: 256,
      } satisfies PluginChannel,
    ],
  },

  setup(config: Physics2DConfig = {}) {
    const cfg: Required<Physics2DConfig> = {
      gravity: config.gravity ?? -9.81,
      gravityX: config.gravityX ?? 0,
      maxEntities: config.maxEntities ?? 10_000,
    };

    let wasmPlugin: WasmPhysics2DPlugin | null = null;
    let eventsBuf: ArrayBuffer | null = null;
    let debugFrameCount = 0;

    // ── Service factory ──────────────────────────────────────────────────

    function createAPI(): Physics2DAPI {
      return {
        addRigidBody(entityIndex, type, x, y, opts = {}) {
          if (!wasmPlugin) throw new Error('[Physics2D] not initialized');
          const handle = wasmPlugin.add_rigid_body(
            entityIndex,
            x,
            y,
            BODY_TYPE[type],
            opts.mass ?? 1.0,
            opts.gravityScale ?? 1.0,
            opts.linearDamping ?? 0.0,
            opts.angularDamping ?? 0.0,
            opts.initialVelocity?.vx ?? 0.0,
            opts.initialVelocity?.vy ?? 0.0,
          );
          console.log(
            `[Physics2D] addRigidBody entity=${entityIndex} type=${type} x=${x.toFixed(3)} y=${y.toFixed(3)} → handle=${handle}`,
          );
          return handle;
        },

        addBoxCollider(bodyHandle, hw, hh, opts: ColliderOptions = {}) {
          console.log(`[Physics2D] addBoxCollider handle=${bodyHandle} hw=${hw} hh=${hh}`);
          wasmPlugin?.add_box_collider(
            bodyHandle,
            hw,
            hh,
            opts.restitution ?? 0,
            opts.friction ?? 0.5,
            opts.isSensor ? 1 : 0,
            opts.density ?? 1.0,
          );
        },

        addBallCollider(bodyHandle, radius, opts: ColliderOptions = {}) {
          console.log(`[Physics2D] addBallCollider handle=${bodyHandle} radius=${radius}`);
          wasmPlugin?.add_ball_collider(
            bodyHandle,
            radius,
            opts.restitution ?? 0,
            opts.friction ?? 0.5,
            opts.isSensor ? 1 : 0,
            opts.density ?? 1.0,
          );
        },

        removeBody(entityIndex) {
          console.log(`[Physics2D] removeBody entity=${entityIndex}`);
          wasmPlugin?.remove_rigid_body(entityIndex);
        },

        setKinematicPosition(entityIndex, x, y) {
          wasmPlugin?.set_kinematic_position(entityIndex, x, y);
        },

        applyImpulse(entityIndex, x, y) {
          wasmPlugin?.apply_impulse(entityIndex, x, y);
        },

        setLinearVelocity(entityIndex, vx, vy) {
          wasmPlugin?.set_linear_velocity(entityIndex, vx, vy);
        },

        getCollisionEvents(): CollisionEvent[] {
          if (!wasmPlugin || !eventsBuf) return [];
          const events = readCollisionEventsFromBuffer(eventsBuf);
          if (import.meta.env.DEV) {
            const f = debugFrameCount;
            if (f <= 300 && f % 60 === 0 && f > 0) {
              const stats = wasmPlugin.stats();
              console.log(`[Physics2D] frame=${f} stats=${stats} events=${events.length}`);
            }
            if (events.length > 0) {
              console.log(`[Physics2D] 🎯 COLLISION EVENTS:`, events);
            }
          }
          return events;
        },

        getPosition(entityIndex) {
          const result = wasmPlugin?.get_position(entityIndex);
          if (!result || result.length < 3) return null;
          return { x: result[0], y: result[1], rotation: result[2] };
        },
      };
    }

    return {
      // ── WASM lifecycle ─────────────────────────────────────────────────

      /**
       * Load the `.wasm` module, instantiate the Rapier2D simulation, and
       * register the `physics` service in `api.services`.
       */
      async onWasmInit(
        _bridge: WasmBridge,
        _region: MemoryRegion | null,
        api: EngineAPI,
        bus: PluginDataBus,
      ): Promise<void> {
        const transformChannel = bus.get('physics2d', 'transform');
        const eventsChannel = bus.get('physics2d', 'events');

        const transformBuf: ArrayBuffer =
          transformChannel?.buffer ?? new ArrayBuffer(cfg.maxEntities * 20);
        const resolvedEventsBuf: ArrayBuffer =
          eventsChannel?.buffer ?? new ArrayBuffer(8 + 256 * 11);
        eventsBuf = resolvedEventsBuf;

        const wasm = await loadWasmPlugin<Physics2DWasmModule>({
          jsUrl: '/wasm/gwen_physics2d.js',
          wasmUrl: '/wasm/gwen_physics2d_bg.wasm',
          name: 'Physics2D',
        });

        wasmPlugin = new wasm.Physics2DPlugin(
          cfg.gravityX,
          cfg.gravity,
          new Uint8Array(transformBuf),
          new Uint8Array(resolvedEventsBuf),
          cfg.maxEntities,
        );

        const physicsService = createAPI();
        api.services.register('physics', physicsService);

        // ── Prefab extensions ────────────────────────────────────────────
        // Souscription au hook prefab:instantiate — le scopedApi garantit
        // le nettoyage automatique à l'unregister() du plugin.
        api.hooks.hook('prefab:instantiate' as any, (entityId: any, extensions: any) => {
          const ext = extensions?.physics as Physics2DPrefabExtension | undefined;
          if (!ext) return;

          const { index: slot } = unpackEntityId(entityId);
          const pos = (api as any).getComponent?.(entityId, { name: 'position' }) as
            | { x: number; y: number }
            | null
            | undefined;

          const handle = physicsService.addRigidBody(
            slot,
            ext.bodyType,
            (pos?.x ?? 0) / PIXELS_PER_METER,
            (pos?.y ?? 0) / PIXELS_PER_METER,
            {
              mass: ext.mass ?? 1.0,
              gravityScale: ext.gravityScale ?? 1.0,
              linearDamping: ext.linearDamping ?? 0.0,
              angularDamping: ext.angularDamping ?? 0.0,
              initialVelocity: ext.initialVelocity
                ? {
                    vx: ext.initialVelocity.vx / PIXELS_PER_METER,
                    vy: ext.initialVelocity.vy / PIXELS_PER_METER,
                  }
                : undefined,
            },
          );

          const colliderOpts: ColliderOptions = {
            restitution: ext.restitution ?? 0,
            friction: ext.friction ?? 0,
            isSensor: ext.isSensor ?? false,
            density: ext.density ?? 1.0,
          };

          if (ext.radius !== undefined) {
            physicsService.addBallCollider(handle, ext.radius / PIXELS_PER_METER, colliderOpts);
          } else if (ext.hw !== undefined && ext.hh !== undefined) {
            physicsService.addBoxCollider(
              handle,
              ext.hw / PIXELS_PER_METER,
              ext.hh / PIXELS_PER_METER,
              colliderOpts,
            );
          }
        });
      },

      /**
       * Advance the Rapier2D simulation by `deltaTime` seconds.
       * Called each frame before `onUpdate`.
       */
      onStep(deltaTime: number): void {
        wasmPlugin?.step(deltaTime);
        debugFrameCount++;
      },

      /** Free the WASM instance when the engine stops. */
      onDestroy(): void {
        wasmPlugin?.free?.();
        wasmPlugin = null;
        eventsBuf = null;
      },
    };
  },
});

// ─── Helper factory ───────────────────────────────────────────────────────────

/**
 * Create a `Physics2DPlugin` instance.
 *
 * ```typescript
 * import { physics2D } from '@djodjonx/gwen-plugin-physics2d';
 *
 * export default defineConfig({
 *   plugins: [physics2D({ gravity: -9.81 })],
 * });
 * ```
 */
export function physics2D(config: Physics2DConfig = {}): InstanceType<typeof Physics2DPlugin> {
  return new Physics2DPlugin(config);
}
