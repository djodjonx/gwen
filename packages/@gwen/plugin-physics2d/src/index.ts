/**
 * @gwen/plugin-physics2d
 *
 * 2D physics plugin for GWEN — powered by Rapier2D compiled to WASM.
 *
 * ## Usage
 * ```typescript
 * // gwen.config.ts
 * import { physics2D } from '@gwen/plugin-physics2d';
 *
 * export default defineConfig({
 *   wasmPlugins: [physics2D({ gravity: -9.81, maxEntities: 10_000 })],
 * });
 * ```
 *
 * ## Accessing the API in a TsPlugin
 * ```typescript
 * onInit(api) {
 *   const physics = api.services.get('physics') as Physics2DAPI;
 *   const h = physics.addRigidBody(entityIndex, 'dynamic', x, y);
 *   physics.addBoxCollider(h, 0.5, 0.5);
 * }
 * ```
 */

import type { GwenWasmPlugin, WasmBridge, EngineAPI, MemoryRegion } from '@gwen/engine-core';
import { loadWasmPlugin } from '@gwen/engine-core';

import type {
  Physics2DConfig,
  Physics2DAPI,
  Physics2DWasmModule,
  WasmPhysics2DPlugin,
  CollisionEvent,
  ColliderOptions,
  RigidBodyType,
} from './types';
import { BODY_TYPE, parseCollisionEvents } from './types';

// Re-export public types
export type { Physics2DConfig, Physics2DAPI, CollisionEvent, ColliderOptions, RigidBodyType };

// ─── Physics2DPlugin ──────────────────────────────────────────────────────────

/**
 * GWEN plugin that provides 2D rigid-body physics via Rapier2D.
 *
 * Implements `GwenWasmPlugin` — loaded as a separate `.wasm` module and
 * communicating with `gwen-core` through a shared memory pointer.
 */
export class Physics2DPlugin implements GwenWasmPlugin {
  // ── GwenWasmPlugin identity ──────────────────────────────────────────────
  readonly id = 'physics2d' as const;
  readonly name = 'Physics2D' as const;
  readonly version = '0.1.0';

  /**
   * Bytes requested in the shared buffer: one 32-byte slot per entity.
   * Matches the layout defined in `memory.rs` (TRANSFORM_STRIDE = 32).
   */
  readonly sharedMemoryBytes: number;

  /** Service map declared for type inference in api.services. */
  readonly provides = { physics: {} as Physics2DAPI };

  // ── Internal state ───────────────────────────────────────────────────────
  private wasmPlugin: WasmPhysics2DPlugin | null = null;
  private readonly config: Required<Physics2DConfig>;

  constructor(config: Physics2DConfig = {}) {
    this.config = {
      gravity: config.gravity ?? -9.81,
      gravityX: config.gravityX ?? 0,
      maxEntities: config.maxEntities ?? 10_000,
    };
    this.sharedMemoryBytes = this.config.maxEntities * 32;
  }

  // ── GwenWasmPlugin lifecycle ─────────────────────────────────────────────

  /**
   * Load the `.wasm` module, instantiate the Rapier2D simulation, and
   * register the `physics` service in `api.services`.
   *
   * Called once by `createEngine()` before `engine.start()`.
   */
  async onInit(bridge: WasmBridge, region: MemoryRegion, api: EngineAPI): Promise<void> {
    const wasm = await loadWasmPlugin<Physics2DWasmModule>({
      jsUrl: '/wasm/gwen_physics2d.js',
      wasmUrl: '/wasm/gwen_physics2d_bg.wasm',
      name: 'Physics2D',
    });

    this.wasmPlugin = new wasm.Physics2DPlugin(
      this.config.gravityX,
      this.config.gravity,
      region.ptr,
      this.config.maxEntities,
    );

    // Register the service so TsPlugins can call api.services.get('physics')
    api.services.register('physics', this._createAPI());
  }

  /**
   * Advance the Rapier2D simulation by `deltaTime` seconds.
   * Called each frame at the WasmStep slot — BEFORE TsPlugin.onUpdate.
   */
  onStep(deltaTime: number): void {
    this.wasmPlugin?.step(deltaTime);
  }

  /** Free the WASM instance. Called when the engine stops. */
  onDestroy(): void {
    this.wasmPlugin?.free?.();
    this.wasmPlugin = null;
  }

  // ── Service factory ──────────────────────────────────────────────────────

  private _createAPI(): Physics2DAPI {
    return {
      addRigidBody: (entityIndex, type, x, y) => {
        if (!this.wasmPlugin) throw new Error('[Physics2D] not initialized');
        return this.wasmPlugin.add_rigid_body(entityIndex, x, y, BODY_TYPE[type]);
      },

      addBoxCollider: (bodyHandle, hw, hh, opts = {}) => {
        this.wasmPlugin?.add_box_collider(
          bodyHandle,
          hw,
          hh,
          opts.restitution ?? 0,
          opts.friction ?? 0.5,
        );
      },

      addBallCollider: (bodyHandle, radius, opts = {}) => {
        this.wasmPlugin?.add_ball_collider(
          bodyHandle,
          radius,
          opts.restitution ?? 0,
          opts.friction ?? 0.5,
        );
      },

      removeBody: (entityIndex) => {
        this.wasmPlugin?.remove_rigid_body(entityIndex);
      },

      applyImpulse: (entityIndex, x, y) => {
        this.wasmPlugin?.apply_impulse(entityIndex, x, y);
      },

      getCollisionEvents: (): CollisionEvent[] => {
        if (!this.wasmPlugin) return [];
        return parseCollisionEvents(this.wasmPlugin.get_collision_events());
      },

      getPosition: (entityIndex) => {
        const result = this.wasmPlugin?.get_position(entityIndex);
        if (!result || result.length < 3) return null;
        return { x: result[0], y: result[1], rotation: result[2] };
      },
    };
  }
}

// ─── Helper factory ───────────────────────────────────────────────────────────

/**
 * Create a `Physics2DPlugin` instance.
 * Use in `gwen.config.ts` under `wasmPlugins`.
 *
 * ```typescript
 * import { physics2D } from '@gwen/plugin-physics2d';
 *
 * export default defineConfig({
 *   wasmPlugins: [physics2D({ gravity: -9.81 })],
 * });
 * ```
 */
export function physics2D(config: Physics2DConfig = {}): Physics2DPlugin {
  return new Physics2DPlugin(config);
}
