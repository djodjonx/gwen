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

import type {
  GwenWasmPlugin,
  WasmBridge,
  EngineAPI,
  MemoryRegion,
  PluginChannel,
} from '@gwen/engine-core';
import { loadWasmPlugin } from '@gwen/engine-core';
import type { PluginDataBus } from '@gwen/engine-core';

import type {
  Physics2DConfig,
  Physics2DAPI,
  Physics2DWasmModule,
  WasmPhysics2DPlugin,
  CollisionEvent,
  ColliderOptions,
  RigidBodyType,
} from './types';
import { BODY_TYPE, readCollisionEventsFromBuffer } from './types';

// Re-export public types
export type { Physics2DConfig, Physics2DAPI, CollisionEvent, ColliderOptions, RigidBodyType };

// ─── Physics2DPlugin ──────────────────────────────────────────────────────────

/**
 * GWEN plugin that provides 2D rigid-body physics via Rapier2D.
 *
 * Uses the Plugin Data Bus for zero-SAB communication:
 * - "transform" channel: TS → Rapier (kinematic body positions)
 * - "events" channel: Rapier → TS (collision events, binary ring buffer)
 */
export class Physics2DPlugin implements GwenWasmPlugin {
  // ── GwenWasmPlugin identity ──────────────────────────────────────────────
  readonly id = 'physics2d' as const;
  readonly name = 'Physics2D' as const;
  readonly version = '0.1.0';

  /**
   * No legacy SAB allocation — the Plugin Data Bus is used instead.
   * Setting this to 0 tells SharedMemoryManager to skip allocation and
   * passes `region = null` to onInit.
   */
  readonly sharedMemoryBytes = 0;

  /**
   * Channel declarations — PluginDataBus allocates one ArrayBuffer per channel
   * before onInit() is called.
   */
  readonly channels: PluginChannel[] = [
    {
      name: 'transform',
      direction: 'read',
      strideBytes: 20, // pos_x, pos_y, rotation, scale_x, scale_y (5 × f32)
      bufferType: 'f32',
    },
    {
      name: 'events',
      direction: 'write',
      bufferType: 'ring',
      capacityEvents: 256,
    },
  ];

  /** Service map declared for type inference in api.services. */
  readonly provides = { physics: {} as Physics2DAPI };

  // ── Internal state ───────────────────────────────────────────────────────
  private wasmPlugin: WasmPhysics2DPlugin | null = null;
  readonly config: Required<Physics2DConfig>;
  private _eventsBuf: ArrayBuffer | null = null;
  private _debugFrameCount = 0;

  constructor(config: Physics2DConfig = {}) {
    this.config = {
      gravity: config.gravity ?? -9.81,
      gravityX: config.gravityX ?? 0,
      maxEntities: config.maxEntities ?? 10_000,
    };
  }

  // ── GwenWasmPlugin lifecycle ─────────────────────────────────────────────

  /**
   * Load the `.wasm` module, instantiate the Rapier2D simulation, and
   * register the `physics` service in `api.services`.
   *
   * Called once by `createEngine()` before `engine.start()`.
   * `region` is always `null` because `sharedMemoryBytes === 0`.
   */
  async onInit(
    _bridge: WasmBridge,
    _region: MemoryRegion | null,
    api: EngineAPI,
    bus?: PluginDataBus,
  ): Promise<void> {
    // Retrieve pre-allocated channel buffers from the PluginDataBus.
    // Fallback to a fresh ArrayBuffer if the bus is not available
    // (e.g. in unit tests without a full engine).
    const transformChannel = bus?.get(this.id, 'transform');
    const eventsChannel = bus?.get(this.id, 'events');

    const transformBuf: ArrayBuffer =
      transformChannel?.buffer ?? new ArrayBuffer(this.config.maxEntities * 20);
    const eventsBuf: ArrayBuffer = eventsChannel?.buffer ?? new ArrayBuffer(8 + 256 * 11);

    this._eventsBuf = eventsBuf;

    const wasm = await loadWasmPlugin<Physics2DWasmModule>({
      jsUrl: '/wasm/gwen_physics2d.js',
      wasmUrl: '/wasm/gwen_physics2d_bg.wasm',
      name: 'Physics2D',
    });

    // Pass JS-native ArrayBuffers as Uint8Array views to the Rust constructor.
    // These buffers are independent of gwen-core's linear memory — memory.grow()
    // in gwen-core has zero effect on them.
    this.wasmPlugin = new wasm.Physics2DPlugin(
      this.config.gravityX,
      this.config.gravity,
      new Uint8Array(transformBuf),
      new Uint8Array(eventsBuf),
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
    this._debugFrameCount++;
  }

  /** Free the WASM instance. Called when the engine stops. */
  onDestroy(): void {
    this.wasmPlugin?.free?.();
    this.wasmPlugin = null;
    this._eventsBuf = null;
  }

  // ── Service factory ──────────────────────────────────────────────────────

  private _createAPI(): Physics2DAPI {
    return {
      addRigidBody: (entityIndex, type, x, y) => {
        if (!this.wasmPlugin) throw new Error('[Physics2D] not initialized');
        const handle = this.wasmPlugin.add_rigid_body(entityIndex, x, y, BODY_TYPE[type]);
        console.log(
          `[Physics2D] addRigidBody entity=${entityIndex} type=${type} x=${x.toFixed(3)} y=${y.toFixed(3)} → handle=${handle}`,
        );
        return handle;
      },

      addBoxCollider: (bodyHandle, hw, hh, opts: ColliderOptions = {}) => {
        console.log(`[Physics2D] addBoxCollider handle=${bodyHandle} hw=${hw} hh=${hh}`);
        this.wasmPlugin?.add_box_collider(
          bodyHandle,
          hw,
          hh,
          opts.restitution ?? 0,
          opts.friction ?? 0.5,
        );
      },

      addBallCollider: (bodyHandle, radius, opts: ColliderOptions = {}) => {
        console.log(`[Physics2D] addBallCollider handle=${bodyHandle} radius=${radius}`);
        this.wasmPlugin?.add_ball_collider(
          bodyHandle,
          radius,
          opts.restitution ?? 0,
          opts.friction ?? 0.5,
        );
      },

      removeBody: (entityIndex) => {
        console.log(`[Physics2D] removeBody entity=${entityIndex}`);
        this.wasmPlugin?.remove_rigid_body(entityIndex);
      },

      setKinematicPosition: (entityIndex, x, y) => {
        this.wasmPlugin?.set_kinematic_position(entityIndex, x, y);
      },

      applyImpulse: (entityIndex, x, y) => {
        this.wasmPlugin?.apply_impulse(entityIndex, x, y);
      },

      getCollisionEvents: (): CollisionEvent[] => {
        if (!this.wasmPlugin || !this._eventsBuf) return [];
        const events = readCollisionEventsFromBuffer(this._eventsBuf);
        const f = this._debugFrameCount;
        if (f <= 300 && f % 60 === 0 && f > 0) {
          const stats = this.wasmPlugin.stats();
          console.log(`[Physics2D] frame=${f} stats=${stats} events=${events.length}`);
        }
        if (events.length > 0) {
          console.log(`[Physics2D] 🎯 COLLISION EVENTS:`, events);
        }
        return events;
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
