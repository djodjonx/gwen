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
import { unpackEntityId, createEntityId } from '@djodjonx/gwen-engine-core';
import type { PluginChannel, GwenPluginMeta } from '@djodjonx/gwen-kit';

import type {
  Physics2DConfig,
  Physics2DAPI,
  Physics2DWasmModule,
  WasmPhysics2DPlugin,
  CollisionEvent,
  CollisionEventsBatch,
  ColliderOptions,
  RigidBodyType,
  Physics2DPrefabExtension,
  CollisionContact,
  Physics2DPluginHooks,
  PhysicsCompatFlags,
  PhysicsColliderDef,
  PhysicsEventMode,
  PhysicsQualityPreset,
  PhysicsColliderShape,
  SensorState,
  BuildTilemapPhysicsChunksInput,
  PatchTilemapPhysicsChunkInput,
  TilemapPhysicsChunk,
  TilemapPhysicsChunkMap,
  TilemapChunkRect,
} from './types';
import { BODY_TYPE, PHYSICS2D_BRIDGE_SCHEMA_VERSION } from './types';
export {
  createPhysicsKinematicSyncSystem,
  createPlatformerGroundedSystem,
  SENSOR_ID_FOOT,
} from './systems';
export { buildTilemapPhysicsChunks, patchTilemapPhysicsChunk } from './helpers/tilemap';
export type { PhysicsKinematicSyncSystemOptions, PlatformerGroundedSystemOptions } from './systems';

// Re-export public types
export type {
  Physics2DConfig,
  Physics2DAPI,
  CollisionEvent,
  CollisionEventsBatch,
  CollisionContact,
  ColliderOptions,
  RigidBodyType,
  Physics2DPrefabExtension,
  Physics2DPluginHooks,
  PhysicsCompatFlags,
  PhysicsColliderDef,
  PhysicsEventMode,
  PhysicsQualityPreset,
  PhysicsColliderShape,
  SensorState,
  BuildTilemapPhysicsChunksInput,
  PatchTilemapPhysicsChunkInput,
  TilemapPhysicsChunk,
  TilemapPhysicsChunkMap,
  TilemapChunkRect,
};
export { PHYSICS2D_BRIDGE_SCHEMA_VERSION } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PIXELS_PER_METER = 50;
const EVENT_HEADER_BYTES = 8;
const EVENT_STRIDE = 19;
const LEGACY_EVENT_STRIDE = 11;
const COLLIDER_ID_ABSENT = 0xffffffff;
const LAYER_ALL = 0xffffffff;
const MAX_LAYERS = 32;

type NormalizedPhysics2DConfig = {
  gravity: number;
  gravityX: number;
  maxEntities: number;
  qualityPreset: PhysicsQualityPreset;
  eventMode: PhysicsEventMode;
  compat: Required<PhysicsCompatFlags>;
  debug: boolean;
  coalesceEvents: boolean;
  layers: Record<string, number>;
};

function normalizeConfig(config: Physics2DConfig): NormalizedPhysics2DConfig {
  const layers: Record<string, number> = {};
  if (config.layers) {
    for (const [name, bit] of Object.entries(config.layers)) {
      if (bit < 0 || bit >= MAX_LAYERS || !Number.isInteger(bit)) {
        throw new Error(
          `[Physics2D] Layer "${name}" has invalid bit index ${bit}. Must be an integer in [0, ${MAX_LAYERS - 1}].`,
        );
      }
      layers[name] = bit;
    }
  }
  return {
    gravity: config.gravity ?? -9.81,
    gravityX: config.gravityX ?? 0,
    maxEntities: config.maxEntities ?? 10_000,
    qualityPreset: config.qualityPreset ?? 'medium',
    eventMode: config.eventMode ?? 'pull',
    compat: {
      legacyPrefabColliderProps: config.compat?.legacyPrefabColliderProps ?? true,
      legacyCollisionJsonParser: config.compat?.legacyCollisionJsonParser ?? true,
    },
    debug: config.debug ?? false,
    coalesceEvents: config.coalesceEvents ?? true,
    layers,
  };
}

// ─── Layer registry ───────────────────────────────────────────────────────────

/**
 * Resolves named layers to a u32 bitmask.
 * Created once per plugin instance at init time.
 */
class LayerRegistry {
  private readonly bits: Record<string, number>;

  constructor(layers: Record<string, number>) {
    if (Object.keys(layers).length > MAX_LAYERS) {
      throw new Error(
        `[Physics2D] Too many layers declared: ${Object.keys(layers).length}. Maximum is ${MAX_LAYERS}.`,
      );
    }
    this.bits = layers;
  }

  /**
   * Resolve a `membershipLayers` or `filterLayers` value to a raw u32 bitmask.
   * - `undefined` → all layers (0xFFFFFFFF)
   * - `number` → used as-is (raw bitmask)
   * - `string[]` → each name resolved; throws on unknown name
   */
  resolve(value: string[] | number | undefined, role: 'membership' | 'filter'): number {
    if (value === undefined) return LAYER_ALL;
    if (typeof value === 'number') return value >>> 0;

    let mask = 0;
    for (const name of value) {
      const bit = this.bits[name];
      if (bit === undefined) {
        const known = Object.keys(this.bits).join(', ');
        throw new Error(
          `[Physics2D] Unknown layer "${name}" in ${role}. Declared layers: [${known}]. ` +
            `Add it to Physics2DConfig.layers or fix the typo.`,
        );
      }
      mask |= 1 << bit;
    }
    return mask >>> 0;
  }
}

function warnDeprecation(message: string) {
  if (import.meta.env.DEV) {
    console.warn(`[Physics2D][deprecated] ${message}`);
  }
}

function addPrefabCollider(
  service: Physics2DAPI,
  bodyHandle: number,
  collider: PhysicsColliderDef,
  registry: LayerRegistry,
  colliderId?: number,
): void {
  const colliderOpts: ColliderOptions = {
    restitution: collider.restitution ?? 0,
    friction: collider.friction ?? 0,
    isSensor: collider.isSensor ?? false,
    density: collider.density ?? 1.0,
    membershipLayers: registry.resolve(collider.membershipLayers, 'membership'),
    filterLayers: registry.resolve(collider.filterLayers, 'filter'),
    colliderId,
  };

  if (collider.shape === 'ball') {
    if (collider.radius === undefined) {
      throw new Error(
        `[Physics2D] Invalid collider config: shape="ball" requires \`radius\` (collider id: ${collider.id ?? '<unnamed>'}).`,
      );
    }
    service.addBallCollider(bodyHandle, collider.radius / PIXELS_PER_METER, colliderOpts);
    return;
  }

  if (collider.shape === 'box') {
    if (collider.hw === undefined || collider.hh === undefined) {
      throw new Error(
        `[Physics2D] Invalid collider config: shape="box" requires both \`hw\` and \`hh\` (collider id: ${collider.id ?? '<unnamed>'}).`,
      );
    }
    service.addBoxCollider(
      bodyHandle,
      collider.hw / PIXELS_PER_METER,
      collider.hh / PIXELS_PER_METER,
      colliderOpts,
    );
    return;
  }

  throw new Error(
    `[Physics2D] Invalid collider shape \`${String((collider as { shape?: unknown }).shape)}\` (collider id: ${collider.id ?? '<unnamed>'}).`,
  );
}

function addLegacyPrefabCollider(
  service: Physics2DAPI,
  bodyHandle: number,
  ext: Physics2DPrefabExtension,
  compat: Required<PhysicsCompatFlags>,
  registry: LayerRegistry,
): void {
  if (!compat.legacyPrefabColliderProps) {
    return;
  }

  const hasLegacyShape = ext.radius !== undefined || ext.hw !== undefined || ext.hh !== undefined;
  if (!hasLegacyShape) {
    return;
  }

  warnDeprecation(
    'Top-level `extensions.physics.radius/hw/hh` is legacy since 0.4.0. Use `extensions.physics.colliders[]`. Removal planned in 1.0.0.',
  );

  const colliderOpts: ColliderOptions = {
    restitution: ext.restitution ?? 0,
    friction: ext.friction ?? 0,
    isSensor: ext.isSensor ?? false,
    density: ext.density ?? 1.0,
    membershipLayers: registry.resolve(undefined, 'membership'),
    filterLayers: registry.resolve(undefined, 'filter'),
  };

  if (ext.radius !== undefined) {
    service.addBallCollider(bodyHandle, ext.radius / PIXELS_PER_METER, colliderOpts);
    return;
  }

  if (ext.hw !== undefined && ext.hh !== undefined) {
    service.addBoxCollider(
      bodyHandle,
      ext.hw / PIXELS_PER_METER,
      ext.hh / PIXELS_PER_METER,
      colliderOpts,
    );
  }
}

// ─── Plugin metadata ───────────────────────────────────────────────────────────

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    physics: { from: '@djodjonx/gwen-plugin-physics2d', exportName: 'Physics2DAPI' },
  },
  hookTypes: {
    'physics:collision': {
      from: '@djodjonx/gwen-plugin-physics2d',
      exportName: 'Physics2DPluginHooks',
    },
    'physics:collision:batch': {
      from: '@djodjonx/gwen-plugin-physics2d',
      exportName: 'Physics2DPluginHooks',
    },
    'physics:sensor:changed': {
      from: '@djodjonx/gwen-plugin-physics2d',
      exportName: 'Physics2DPluginHooks',
    },
  },
  prefabExtensionTypes: {
    physics: {
      from: '@djodjonx/gwen-plugin-physics2d',
      exportName: 'Physics2DPrefabExtension',
    },
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
export const Physics2DPlugin = definePlugin((config: Physics2DConfig = {}) => {
  const cfg = normalizeConfig(config);
  const isDebug = cfg.debug;
  const layerRegistry = new LayerRegistry(cfg.layers);

  let wasmPlugin: WasmPhysics2DPlugin | null = null;
  let eventsView: DataView | null = null;
  let cachedCollisionBatch: CollisionEventsBatch | null = null;
  let cachedCollisionEventCount = 0;
  let debugFrameCount = 0;
  let physicsService: Physics2DAPI | null = null;
  const pooledCollisionEvents: CollisionEvent[] = [];
  const pooledCollisionBatch: CollisionEventsBatch = {
    frame: 0,
    count: 0,
    droppedSinceLastRead: 0,
    droppedCritical: 0,
    droppedNonCritical: 0,
    coalesced: cfg.coalesceEvents,
    events: pooledCollisionEvents,
  };

  /**
   * Per-slot collision callbacks registered via prefab extensions.
   * Key = entity slot index, Value = onCollision handler.
   */
  const collisionCallbacks = new Map<
    number,
    NonNullable<Physics2DPrefabExtension['onCollision']>
  >();

  // ── Service factory ──────────────────────────────────────────────────

  function createAPI(): Physics2DAPI {
    function materializeCollisionBatch(max?: number): CollisionEventsBatch {
      if (!eventsView) {
        pooledCollisionEvents.length = 0;
        pooledCollisionBatch.count = 0;
        pooledCollisionBatch.events = pooledCollisionEvents;
        cachedCollisionEventCount = 0;
        cachedCollisionBatch = pooledCollisionBatch;
        return pooledCollisionBatch;
      }

      if (!cachedCollisionBatch) {
        const writeHead = eventsView.getUint32(0, true);
        const readHead = eventsView.getUint32(4, true);
        const payloadBytes = eventsView.byteLength - EVENT_HEADER_BYTES;
        const stride = payloadBytes % EVENT_STRIDE === 0 ? EVENT_STRIDE : LEGACY_EVENT_STRIDE;
        const capacity = Math.floor(payloadBytes / stride);

        let idx = readHead;
        let eventCount = 0;

        while (capacity > 0 && idx !== writeHead) {
          const offset = EVENT_HEADER_BYTES + idx * stride;
          const event =
            pooledCollisionEvents[eventCount] ??
            (pooledCollisionEvents[eventCount] = {
              slotA: 0,
              slotB: 0,
              aColliderId: undefined,
              bColliderId: undefined,
              started: false,
            });
          event.slotA = eventsView.getUint32(offset + 2, true);
          event.slotB = eventsView.getUint32(offset + 6, true);
          if (stride === EVENT_STRIDE) {
            const rawA = eventsView.getUint32(offset + 10, true);
            const rawB = eventsView.getUint32(offset + 14, true);
            event.aColliderId = rawA === COLLIDER_ID_ABSENT ? undefined : rawA;
            event.bColliderId = rawB === COLLIDER_ID_ABSENT ? undefined : rawB;
            event.started = (eventsView.getUint8(offset + 18) & 1) === 1;
          } else {
            event.aColliderId = undefined;
            event.bColliderId = undefined;
            event.started = (eventsView.getUint8(offset + 10) & 1) === 1;
          }
          eventCount++;
          idx = (idx + 1) % capacity;
        }

        eventsView.setUint32(4, writeHead, true);
        cachedCollisionEventCount = eventCount;

        const [frame, droppedCritical, droppedNonCritical, coalescedFlag] =
          wasmPlugin?.consume_event_metrics?.() ?? [0, 0, 0, cfg.coalesceEvents ? 1 : 0];

        pooledCollisionBatch.frame = frame;
        pooledCollisionBatch.droppedCritical = droppedCritical;
        pooledCollisionBatch.droppedNonCritical = droppedNonCritical;
        pooledCollisionBatch.droppedSinceLastRead = droppedCritical + droppedNonCritical;
        pooledCollisionBatch.coalesced = coalescedFlag === 1;
        pooledCollisionBatch.events = pooledCollisionEvents;
        cachedCollisionBatch = pooledCollisionBatch;
      }

      const visibleCount =
        max === undefined || max < 0
          ? cachedCollisionEventCount
          : Math.min(max, cachedCollisionEventCount);
      pooledCollisionEvents.length = visibleCount;
      pooledCollisionBatch.count = visibleCount;

      if (isDebug && import.meta.env.DEV) {
        const f = debugFrameCount;
        if (f <= 300 && f % 60 === 0 && f > 0 && wasmPlugin) {
          const stats = wasmPlugin.stats();
          console.log(
            `[Physics2D] frame=${f} stats=${stats} events=${visibleCount} dropped=${pooledCollisionBatch.droppedSinceLastRead} preset=${cfg.qualityPreset} mode=${cfg.eventMode}`,
          );
        }
      }

      return pooledCollisionBatch;
    }

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
        if (isDebug) {
          console.log(
            `[Physics2D] addRigidBody entity=${entityIndex} type=${type} x=${x.toFixed(3)} y=${y.toFixed(3)} → handle=${handle}`,
          );
        }
        return handle;
      },

      addBoxCollider(bodyHandle, hw, hh, opts: ColliderOptions = {}) {
        if (isDebug) {
          console.log(`[Physics2D] addBoxCollider handle=${bodyHandle} hw=${hw} hh=${hh}`);
        }
        const membership =
          typeof opts.membershipLayers === 'number'
            ? opts.membershipLayers >>> 0
            : layerRegistry.resolve(opts.membershipLayers as string[] | undefined, 'membership');
        const filter =
          typeof opts.filterLayers === 'number'
            ? opts.filterLayers >>> 0
            : layerRegistry.resolve(opts.filterLayers as string[] | undefined, 'filter');

        if (opts.colliderId === undefined) {
          wasmPlugin?.add_box_collider(
            bodyHandle,
            hw,
            hh,
            opts.restitution ?? 0,
            opts.friction ?? 0.5,
            opts.isSensor ? 1 : 0,
            opts.density ?? 1.0,
            membership,
            filter,
          );
        } else {
          wasmPlugin?.add_box_collider(
            bodyHandle,
            hw,
            hh,
            opts.restitution ?? 0,
            opts.friction ?? 0.5,
            opts.isSensor ? 1 : 0,
            opts.density ?? 1.0,
            membership,
            filter,
            opts.colliderId,
          );
        }
      },

      addBallCollider(bodyHandle, radius, opts: ColliderOptions = {}) {
        if (isDebug) {
          console.log(`[Physics2D] addBallCollider handle=${bodyHandle} radius=${radius}`);
        }
        const membership =
          typeof opts.membershipLayers === 'number'
            ? opts.membershipLayers >>> 0
            : layerRegistry.resolve(opts.membershipLayers as string[] | undefined, 'membership');
        const filter =
          typeof opts.filterLayers === 'number'
            ? opts.filterLayers >>> 0
            : layerRegistry.resolve(opts.filterLayers as string[] | undefined, 'filter');

        if (opts.colliderId === undefined) {
          wasmPlugin?.add_ball_collider(
            bodyHandle,
            radius,
            opts.restitution ?? 0,
            opts.friction ?? 0.5,
            opts.isSensor ? 1 : 0,
            opts.density ?? 1.0,
            membership,
            filter,
          );
        } else {
          wasmPlugin?.add_ball_collider(
            bodyHandle,
            radius,
            opts.restitution ?? 0,
            opts.friction ?? 0.5,
            opts.isSensor ? 1 : 0,
            opts.density ?? 1.0,
            membership,
            filter,
            opts.colliderId,
          );
        }
      },

      removeBody(entityIndex) {
        if (isDebug) {
          console.log(`[Physics2D] removeBody entity=${entityIndex}`);
        }
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

      getLinearVelocity(entityIndex) {
        const result = wasmPlugin?.get_linear_velocity(entityIndex);
        if (!result || result.length < 2) return null;
        return { x: result[0], y: result[1] };
      },

      getCollisionEventsBatch(opts = {}) {
        return materializeCollisionBatch(opts.max);
      },

      getCollisionEvents(): CollisionEvent[] {
        return this.getCollisionEventsBatch().events as CollisionEvent[];
      },

      getPosition(entityIndex) {
        const result = wasmPlugin?.get_position(entityIndex);
        if (!result || result.length < 3) return null;
        return { x: result[0], y: result[1], rotation: result[2] };
      },

      getSensorState(entityIndex, sensorId): SensorState {
        const result = wasmPlugin?.get_sensor_state?.(entityIndex, sensorId);
        if (!result || result.length < 2) return { contactCount: 0, isActive: false };
        return { contactCount: result[0], isActive: result[1] !== 0 };
      },

      updateSensorState(entityIndex, sensorId, started) {
        wasmPlugin?.update_sensor_state?.(entityIndex, sensorId, started ? 1 : 0);
      },
    };
  }

  return {
    name: 'Physics2D',
    meta: pluginMeta,
    provides: { physics: {} as Physics2DAPI },
    providesHooks: {} as Physics2DPluginHooks,
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

    // ── WASM lifecycle ─────────────────────────────────────────────────

    /**
     * Load the `.wasm` module, instantiate the Rapier2D simulation, and
     * register the `physics` service in `api.services`.
     */
    async onWasmInit(_bridge, _region, api, bus): Promise<void> {
      const transformChannel = bus.get('physics2d', 'transform');
      const eventsChannel = bus.get('physics2d', 'events');

      const transformBuf: ArrayBuffer =
        transformChannel?.buffer ?? new ArrayBuffer(cfg.maxEntities * 20);
      const resolvedEventsBuf: ArrayBuffer =
        eventsChannel?.buffer ?? new ArrayBuffer(8 + 256 * EVENT_STRIDE);
      eventsView = new DataView(resolvedEventsBuf);
      cachedCollisionBatch = null;
      cachedCollisionEventCount = 0;

      // DataBus allocates channels with engine.maxEntities. Keep the WASM plugin
      // in sync with the actual channel capacity to avoid Uint8Array.copy_from panics.
      const channelMaxEntities = Math.floor(transformBuf.byteLength / 20);
      const runtimeMaxEntities = channelMaxEntities > 0 ? channelMaxEntities : cfg.maxEntities;
      if (runtimeMaxEntities !== cfg.maxEntities) {
        console.warn(
          `[Physics2D] maxEntities mismatch: plugin=${cfg.maxEntities}, channel=${runtimeMaxEntities}. Using channel capacity.`,
        );
      }

      const wasm = await loadWasmPlugin<Physics2DWasmModule>({
        jsUrl: '/wasm/gwen_physics2d.js',
        wasmUrl: '/wasm/gwen_physics2d_bg.wasm',
        name: 'Physics2D',
      });

      const instantiatedPlugin = new wasm.Physics2DPlugin(
        cfg.gravityX,
        cfg.gravity,
        new Uint8Array(transformBuf),
        new Uint8Array(resolvedEventsBuf),
        runtimeMaxEntities,
      );

      const bridgeVersion = instantiatedPlugin.bridge_schema_version?.();
      if (bridgeVersion !== undefined && bridgeVersion !== PHYSICS2D_BRIDGE_SCHEMA_VERSION) {
        instantiatedPlugin.free?.();
        throw new Error(
          `[Physics2D] Bridge schema mismatch: TS=${PHYSICS2D_BRIDGE_SCHEMA_VERSION}, WASM=${bridgeVersion}. Rebuild the physics wasm package before running this build.`,
        );
      }

      wasmPlugin = instantiatedPlugin;
      wasmPlugin.set_event_coalescing?.(cfg.coalesceEvents ? 1 : 0);

      physicsService = createAPI();
      api.services.register('physics', physicsService);

      // Local non-null alias used inside hook closures — TypeScript cannot narrow
      // the outer `physicsService` variable through a closure boundary.
      const svc = physicsService;

      // Souscription au hook prefab:instantiate — le scopedApi garantit
      // le nettoyage automatique à l'unregister() du plugin.
      api.hooks.hook('prefab:instantiate', (entityId, extensions) => {
        const ext = extensions?.physics as Physics2DPrefabExtension | undefined;
        if (!ext) return;

        const bodyType = ext.bodyType ?? 'dynamic';
        const { index: slot } = unpackEntityId(entityId);
        const pos = api.getComponent?.(entityId, 'position') as
          | { x: number; y: number }
          | null
          | undefined;

        const handle = svc.addRigidBody(
          slot,
          bodyType,
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

        const hasNextColliders = Array.isArray(ext.colliders) && ext.colliders.length > 0;
        if (hasNextColliders) {
          const seenIds = new Set<string>();
          for (const [colliderIndex, collider] of ext.colliders!.entries()) {
            if (collider.id) {
              if (seenIds.has(collider.id)) {
                throw new Error(
                  `[Physics2D] Duplicate collider id \`${collider.id}\` in prefab entity slot=${slot}. ` +
                    'Collider ids must be unique per prefab declaration.',
                );
              }
              seenIds.add(collider.id);
            }
            addPrefabCollider(svc, handle, collider, layerRegistry, colliderIndex);
          }
        } else {
          addLegacyPrefabCollider(svc, handle, ext, cfg.compat, layerRegistry);
        }

        // Register the per-entity onCollision callback if declared in the extension.
        if (ext.onCollision) {
          collisionCallbacks.set(slot, ext.onCollision);
        }
      });

      // Clean up callbacks and rigid bodies when an entity is destroyed.
      api.hooks.hook('entity:destroy', (entityId) => {
        const { index: slot } = unpackEntityId(entityId);
        collisionCallbacks.delete(slot);
        // Important: keep Rapier in sync with ECS lifecycle.
        // Without this, stale bodies can survive scene transitions and trigger
        // immediate phantom collisions on next game start.
        svc.removeBody(slot);
      });
    },

    /**
     * Resolve raw collision events into enriched `CollisionContact`s and emit the
     * `physics:collision` hook. Also dispatches per-entity `onCollision` callbacks
     * declared in prefab extensions.
     *
     * Called every frame after `onStep`.
     */
    onUpdate(api): void {
      if (!wasmPlugin || !physicsService) return;
      if (cfg.eventMode !== 'hybrid' && collisionCallbacks.size === 0) return;

      const batch = physicsService.getCollisionEventsBatch();
      if (batch.count === 0) return;

      if (cfg.eventMode === 'hybrid') {
        void api.hooks.callHook('physics:collision:batch', batch);
      }

      // Update sensor states from events, emitting physics:sensor:changed on transitions.
      for (const { slotA, slotB, started } of batch.events) {
        // We track sensors by checking both sides of each contact.
        // Only emit the hook when the is_active flag actually changes.
        for (const [slot, other] of [
          [slotA, slotB],
          [slotB, slotA],
        ] as [number, number][]) {
          // sensor_id = other slot (simplest agnostic key; callers can use layer bits instead)
          const prevState = physicsService.getSensorState(slot, other);
          physicsService.updateSensorState(slot, other, started);
          const nextState = physicsService.getSensorState(slot, other);
          if (prevState.isActive !== nextState.isActive) {
            void api.hooks.callHook('physics:sensor:changed', slot, other, nextState);
          }
        }
      }

      // Resolve slot indices -> packed EntityIds
      const contacts: CollisionContact[] = [];
      for (const { slotA, slotB, aColliderId, bColliderId, started } of batch.events) {
        const genA = api.getEntityGeneration(slotA);
        const genB = api.getEntityGeneration(slotB);
        const entityA = createEntityId(slotA, genA);
        const entityB = createEntityId(slotB, genB);
        contacts.push({
          entityA,
          entityB,
          slotA,
          slotB,
          aColliderId,
          bColliderId,
          started,
        });
      }

      const frozenContacts: ReadonlyArray<CollisionContact> = contacts;
      void api.hooks.callHook('physics:collision', frozenContacts);

      for (const contact of contacts) {
        const cbA = collisionCallbacks.get(contact.slotA);
        if (cbA) cbA(contact.entityA, contact.entityB, contact, api);

        const cbB = collisionCallbacks.get(contact.slotB);
        if (cbB) cbB(contact.entityB, contact.entityA, contact, api);
      }
    },

    /**
     * Advance the Rapier2D simulation by `deltaTime` seconds.
     * Called each frame before `onUpdate`.
     */
    onStep(deltaTime: number): void {
      cachedCollisionBatch = null;
      cachedCollisionEventCount = 0;
      wasmPlugin?.step(deltaTime);
      debugFrameCount++;
    },

    /** Free the WASM instance when the engine stops. */
    onDestroy(): void {
      wasmPlugin?.free?.();
      wasmPlugin = null;
      eventsView = null;
      cachedCollisionBatch = null;
      cachedCollisionEventCount = 0;
      physicsService = null;
      collisionCallbacks.clear();
    },
  };
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
