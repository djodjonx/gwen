/// <reference types="vite/client" />

/**
 * @gwenjs/physics3d
 *
 * 3D physics plugin for GWEN — Rapier3D adapter with full collider, sensor,
 * collision event, and layer support. Falls back to a deterministic local
 * TypeScript simulation when the WASM physics3d variant is unavailable.
 */

import { definePlugin } from '@gwenjs/kit';
import { getWasmBridge, createEntityId, unpackEntityId } from '@gwenjs/core';
import type { EntityId, GwenEngine } from '@gwenjs/core';
import type { GwenPluginMeta } from '@gwenjs/kit';

import type {
  Physics3DAPI,
  Physics3DBodyHandle,
  Physics3DBodyOptions,
  Physics3DBodyState,
  Physics3DBodySnapshot,
  Physics3DConfig,
  Physics3DEntityId,
  Physics3DQuat,
  Physics3DVec3,
  Physics3DBodyKind,
  Physics3DColliderOptions,
  Physics3DCollisionContact,
  Physics3DSensorState,
  Physics3DPrefabExtension,
  Physics3DPluginHooks,
} from './types';

import { PHYSICS3D_MATERIAL_PRESETS } from './types';

import {
  normalizePhysics3DConfig,
  buildLayerRegistry,
  resolveLayerBits,
  QUALITY_PRESETS,
} from './config';

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Number of bytes per collision event entry in the WASM ring buffer.
 * Matches the Rust `PhysicsCollisionEvent3D` #[repr(C)] layout (16 bytes):
 * [entity_a: u32][entity_b: u32][flags: u32][collider_a_id: u16][collider_b_id: u16]
 * flags bit 0: 1 = contact started, 0 = contact ended
 */
const EVENT_STRIDE_3D = 16;

/** Maximum events readable per frame. Matches Rust MAX_COLLISION_EVENTS_3D. */
const MAX_EVENTS_3D = 1024;

/** Sentinel value indicating an absent collider id (u16::MAX). */
const COLLIDER_ID_ABSENT = 0xffff;

// ─── Plugin metadata ────────────────────────────────────────────────────────────

/**
 * Static CLI metadata for `gwen prepare` code generation.
 */
export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    physics3d: {
      from: '@gwenjs/physics3d',
      exportName: 'Physics3DAPI',
    },
  },
  hookTypes: {
    'physics3d:collision': {
      from: '@gwenjs/physics3d',
      exportName: 'Physics3DPluginHooks',
    },
    'physics3d:sensor:changed': {
      from: '@gwenjs/physics3d',
      exportName: 'Physics3DPluginHooks',
    },
  },
  prefabExtensionTypes: {
    physics3d: {
      from: '@gwenjs/physics3d',
      exportName: 'Physics3DPrefabExtension',
    },
  },
};

// ─── Internal types ─────────────────────────────────────────────────────────────

/**
 * Internal raw event read from the WASM ring buffer.
 * Carries slot indices not exposed on the public `Physics3DCollisionContact`.
 */
type InternalCollisionEvent3D = {
  slotA: number;
  slotB: number;
  aColliderId: number | undefined;
  bColliderId: number | undefined;
  started: boolean;
};

/** WASM exports available in the physics3d variant. */
interface Physics3DWasmBridge {
  // World lifecycle
  physics3d_init?: (gx: number, gy: number, gz: number, maxEntities: number) => void;
  physics3d_step?: (delta: number) => void;
  physics3d_set_quality?: (preset: number) => void;
  physics3d_set_event_coalescing?: (enabled: number) => void;

  // Body lifecycle
  physics3d_add_body?: (
    entityIndex: number,
    x: number,
    y: number,
    z: number,
    kind: number,
    mass: number,
    linearDamping: number,
    angularDamping: number,
  ) => boolean;
  physics3d_remove_body?: (entityIndex: number) => boolean;
  physics3d_has_body?: (entityIndex: number) => boolean;

  // State read/write — Float32Array layout: [px,py,pz, qx,qy,qz,qw, vx,vy,vz, ax,ay,az]
  physics3d_get_body_state?: (entityIndex: number) => Float32Array;
  physics3d_set_body_state?: (
    entityIndex: number,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
    vx: number,
    vy: number,
    vz: number,
    ax: number,
    ay: number,
    az: number,
  ) => boolean;

  // Velocity
  physics3d_get_linear_velocity?: (entityIndex: number) => Float32Array;
  physics3d_set_linear_velocity?: (
    entityIndex: number,
    vx: number,
    vy: number,
    vz: number,
  ) => boolean;
  physics3d_get_angular_velocity?: (entityIndex: number) => Float32Array;
  physics3d_set_angular_velocity?: (
    entityIndex: number,
    ax: number,
    ay: number,
    az: number,
  ) => boolean;

  // Impulse
  physics3d_apply_impulse?: (entityIndex: number, ix: number, iy: number, iz: number) => boolean;
  physics3d_apply_angular_impulse?: (
    entityIndex: number,
    ix: number,
    iy: number,
    iz: number,
  ) => boolean;

  // Body kind
  physics3d_get_body_kind?: (entityIndex: number) => number;
  physics3d_set_body_kind?: (entityIndex: number, kind: number) => boolean;

  // Kinematic positioning
  physics3d_set_kinematic_position?: (
    entityIndex: number,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
  ) => boolean;

  // Collider management
  physics3d_add_box_collider?: (
    entityIndex: number,
    halfX: number,
    halfY: number,
    halfZ: number,
    friction: number,
    restitution: number,
    density: number,
    isSensor: number,
    membership: number,
    filter: number,
    colliderId: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) => boolean;
  physics3d_add_sphere_collider?: (
    entityIndex: number,
    radius: number,
    friction: number,
    restitution: number,
    density: number,
    isSensor: number,
    membership: number,
    filter: number,
    colliderId: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) => boolean;
  physics3d_add_capsule_collider?: (
    entityIndex: number,
    radius: number,
    halfHeight: number,
    friction: number,
    restitution: number,
    density: number,
    isSensor: number,
    membership: number,
    filter: number,
    colliderId: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
  ) => boolean;
  physics3d_remove_collider?: (entityIndex: number, colliderId: number) => boolean;

  // Sensor
  physics3d_get_sensor_state?: (entityIndex: number, sensorId: number) => BigInt64Array | number[];
  physics3d_update_sensor_state?: (
    entityIndex: number,
    sensorId: number,
    isActive: number,
    count: number,
  ) => void;

  // Collision events
  physics3d_get_collision_events_ptr?: () => number;
  physics3d_get_collision_event_count?: () => number;
  physics3d_consume_events?: () => void;

  // Memory
  memory?: WebAssembly.Memory;
}

/** Minimal bridge runtime shape returned by getWasmBridge(). */
interface Physics3DBridgeRuntime {
  variant: 'light' | 'physics2d' | 'physics3d';
  getPhysicsBridge(): Physics3DWasmBridge;
  getLinearMemory?(): WebAssembly.Memory | null;
  /** Returns the current generation counter for an entity slot index. */
  getEntityGeneration?(index: number): number | undefined;
}

// ─── Plugin implementation ──────────────────────────────────────────────────────

/**
 * GWEN plugin providing 3D rigid-body physics via Rapier3D integrated in the
 * core WASM. Falls back to a deterministic TypeScript simulation when the WASM
 * physics3d variant is not loaded (e.g. during tests).
 */
export const Physics3DPlugin = definePlugin((config: Physics3DConfig = {}) => {
  const cfg = normalizePhysics3DConfig(config);

  // Layer registry built from config
  const layerRegistry = buildLayerRegistry(cfg.layers);

  // Plugin state
  let ready = false;
  let _variant: 'light' | 'physics2d' | 'physics3d' = 'light';
  let stepFn: ((delta: number) => void) | null = null;
  let offEntityDestroyed: (() => void) | null = null;
  let nextBodyId = 1;
  /** 'wasm' when Rapier3D body APIs are available; 'local' otherwise. */
  let backendMode: 'wasm' | 'local' = 'local';
  /** Cached WASM bridge — non-null only in 'wasm' mode. */
  let wasmBridge: Physics3DWasmBridge | null = null;
  /** Bridge runtime for memory access. */
  let bridgeRuntime: Physics3DBridgeRuntime | null = null;
  /** Stored GwenEngine reference — set in setup(), used by lifecycle hooks. */
  let _engine: GwenEngine | null = null;

  // Body registry — used in both modes as the metadata store
  const bodyByEntity = new Map<number, Physics3DBodyHandle>();

  // Local simulation state (used only in 'local' mode)
  const stateByEntity = new Map<number, Physics3DBodyState>();

  // Collider registry — used in both modes
  const localColliders = new Map<number, Physics3DColliderOptions[]>();

  // Sensor state — outer key = entity slot index, inner key = sensorId
  const localSensorStates = new Map<number, Map<number, Physics3DSensorState>>();

  // Per-entity collision callbacks
  const entityCollisionCallbacks = new Map<
    number,
    NonNullable<Physics3DPrefabExtension['onCollision']>
  >();

  // Current frame contacts (rebuilt each frame in onUpdate)
  let currentFrameContacts: Physics3DCollisionContact[] = [];

  // WASM event buffer state
  let eventsView: DataView | null = null;
  let eventsBufferRef: ArrayBuffer | null = null;

  // Pooled internal event array — reused every frame to avoid GC pressure
  const pooledEvents: InternalCollisionEvent3D[] = [];

  // Event metrics for the last processed frame
  let lastFrameEventCount = 0;

  // ─── Utility helpers ─────────────────────────────────────────────────────────

  /** Convert a Physics3DEntityId to the u32 entity slot index used by WASM and as Map key. */
  const toEntityIndex = (entityId: Physics3DEntityId): number => {
    if (typeof entityId === 'bigint') return Number(entityId & 0xffffffffn);
    if (typeof entityId === 'number') return entityId;
    return parseInt(entityId as string, 10);
  };

  /** Map WASM kind u8 (0=Fixed, 1=Dynamic, 2=Kinematic, 255=sentinel) to TS string. */
  const kindFromU8 = (k: number): Physics3DBodyKind => {
    if (k === 0) return 'fixed';
    if (k === 2) return 'kinematic';
    return 'dynamic';
  };

  /** Map TS kind string to WASM u8 (0=Fixed, 1=Dynamic, 2=Kinematic). */
  const kindToU8 = (k: Physics3DBodyKind): number => {
    if (k === 'fixed') return 0;
    if (k === 'kinematic') return 2;
    return 1;
  };

  /** Parse a 13-element Float32Array from physics3d_get_body_state into a Physics3DBodyState. */
  const parseBodyState = (arr: Float32Array): Physics3DBodyState => ({
    position: { x: arr[0] ?? 0, y: arr[1] ?? 0, z: arr[2] ?? 0 },
    rotation: { x: arr[3] ?? 0, y: arr[4] ?? 0, z: arr[5] ?? 0, w: arr[6] ?? 1 },
    linearVelocity: { x: arr[7] ?? 0, y: arr[8] ?? 0, z: arr[9] ?? 0 },
    angularVelocity: { x: arr[10] ?? 0, y: arr[11] ?? 0, z: arr[12] ?? 0 },
  });

  /** Deep-clone a Physics3DBodyState so snapshots are not aliased. */
  const cloneState = (s: Physics3DBodyState): Physics3DBodyState => ({
    position: { ...s.position },
    rotation: { ...s.rotation },
    linearVelocity: { ...s.linearVelocity },
    angularVelocity: { ...s.angularVelocity },
  });

  /**
   * Resolve material preset defaults into explicit collider values.
   * Explicit options always win over the preset.
   */
  const resolveColliderMaterial = (
    options: Physics3DColliderOptions,
  ): { friction: number; restitution: number; density: number } => {
    const preset = options.materialPreset
      ? PHYSICS3D_MATERIAL_PRESETS[options.materialPreset]
      : PHYSICS3D_MATERIAL_PRESETS.default;

    return {
      friction: options.friction ?? preset.friction,
      restitution: options.restitution ?? preset.restitution,
      density: options.density ?? preset.density,
    };
  };

  /** Generate the next stable collider id for an entity. */
  const nextColliderIdForEntity = (entityId: Physics3DEntityId): number => {
    const slot = toEntityIndex(entityId);
    const existing = localColliders.get(slot);
    return existing ? existing.length : 0;
  };

  // ─── Local simulation ─────────────────────────────────────────────────────────

  const createBodyLocal = (
    entityId: Physics3DEntityId,
    options: Physics3DBodyOptions = {},
  ): Physics3DBodyHandle => {
    const slot = toEntityIndex(entityId);
    const handle: Physics3DBodyHandle = {
      bodyId: nextBodyId++,
      entityId,
      kind: options.kind ?? 'dynamic',
      mass: Math.max(0.0001, options.mass ?? 1),
      linearDamping: Math.max(0, options.linearDamping ?? 0),
      angularDamping: Math.max(0, options.angularDamping ?? 0),
    };
    bodyByEntity.set(slot, handle);
    stateByEntity.set(slot, {
      position: vec3(options.initialPosition),
      rotation: quat(options.initialRotation),
      linearVelocity: vec3(options.initialLinearVelocity),
      angularVelocity: vec3(options.initialAngularVelocity),
    });
    return handle;
  };

  const removeBodyLocal = (entityId: Physics3DEntityId): boolean => {
    const slot = toEntityIndex(entityId);
    stateByEntity.delete(slot);
    localColliders.delete(slot);
    return bodyByEntity.delete(slot);
  };

  const advanceLocalState = (deltaSeconds: number): void => {
    for (const [slot, handle] of bodyByEntity.entries()) {
      const state = stateByEntity.get(slot);
      if (!state) continue;

      if (handle.kind === 'dynamic') {
        state.linearVelocity = {
          x: state.linearVelocity.x + cfg.gravity.x * deltaSeconds,
          y: state.linearVelocity.y + cfg.gravity.y * deltaSeconds,
          z: state.linearVelocity.z + cfg.gravity.z * deltaSeconds,
        };
      }

      if (handle.kind === 'fixed') continue;

      if (handle.linearDamping > 0) {
        const f = Math.max(0, 1 - handle.linearDamping * deltaSeconds);
        state.linearVelocity = {
          x: state.linearVelocity.x * f,
          y: state.linearVelocity.y * f,
          z: state.linearVelocity.z * f,
        };
      }

      if (handle.angularDamping > 0) {
        const f = Math.max(0, 1 - handle.angularDamping * deltaSeconds);
        state.angularVelocity = {
          x: state.angularVelocity.x * f,
          y: state.angularVelocity.y * f,
          z: state.angularVelocity.z * f,
        };
      }

      state.position = {
        x: state.position.x + state.linearVelocity.x * deltaSeconds,
        y: state.position.y + state.linearVelocity.y * deltaSeconds,
        z: state.position.z + state.linearVelocity.z * deltaSeconds,
      };
    }
  };

  // ─── WASM body management ─────────────────────────────────────────────────────

  const createBodyWasm = (
    entityId: Physics3DEntityId,
    options: Physics3DBodyOptions = {},
  ): Physics3DBodyHandle => {
    const handle: Physics3DBodyHandle = {
      bodyId: nextBodyId++,
      entityId,
      kind: options.kind ?? 'dynamic',
      mass: Math.max(0.0001, options.mass ?? 1),
      linearDamping: Math.max(0, options.linearDamping ?? 0),
      angularDamping: Math.max(0, options.angularDamping ?? 0),
    };
    const idx = toEntityIndex(entityId);
    wasmBridge!.physics3d_add_body!(
      idx,
      options.initialPosition?.x ?? 0,
      options.initialPosition?.y ?? 0,
      options.initialPosition?.z ?? 0,
      kindToU8(handle.kind),
      handle.mass,
      handle.linearDamping,
      handle.angularDamping,
    );

    // Apply initial rotation / velocity when provided
    const hasInitRot = options.initialRotation && Object.keys(options.initialRotation).length > 0;
    const hasInitVel =
      options.initialLinearVelocity && Object.keys(options.initialLinearVelocity).length > 0;
    const hasInitAng =
      options.initialAngularVelocity && Object.keys(options.initialAngularVelocity).length > 0;
    if (hasInitRot || hasInitVel || hasInitAng) {
      const p = options.initialPosition ?? {};
      const r = options.initialRotation ?? {};
      const lv = options.initialLinearVelocity ?? {};
      const av = options.initialAngularVelocity ?? {};
      wasmBridge!.physics3d_set_body_state!(
        idx,
        p.x ?? 0,
        p.y ?? 0,
        p.z ?? 0,
        r.x ?? 0,
        r.y ?? 0,
        r.z ?? 0,
        r.w ?? 1,
        lv.x ?? 0,
        lv.y ?? 0,
        lv.z ?? 0,
        av.x ?? 0,
        av.y ?? 0,
        av.z ?? 0,
      );
    }

    bodyByEntity.set(idx, handle);
    return handle;
  };

  const removeBodyWasm = (entityId: Physics3DEntityId): boolean => {
    const slot = toEntityIndex(entityId);
    if (!bodyByEntity.has(slot)) return false;
    wasmBridge!.physics3d_remove_body!(slot);
    bodyByEntity.delete(slot);
    localColliders.delete(slot);
    return true;
  };

  // ─── Unified body API ─────────────────────────────────────────────────────────

  const createBody = (
    entityId: Physics3DEntityId,
    options: Physics3DBodyOptions = {},
  ): Physics3DBodyHandle => {
    // Remove previous body first to avoid duplicate state
    if (bodyByEntity.has(toEntityIndex(entityId))) {
      if (backendMode === 'wasm') removeBodyWasm(entityId);
      else removeBodyLocal(entityId);
    }
    const handle =
      backendMode === 'wasm'
        ? createBodyWasm(entityId, options)
        : createBodyLocal(entityId, options);

    // Attach declared colliders
    for (const [idx, colliderOpts] of (options.colliders ?? []).entries()) {
      const resolved = { ...colliderOpts };
      if (resolved.colliderId === undefined) resolved.colliderId = idx;
      addColliderImpl(entityId, resolved);
    }

    return handle;
  };

  const removeBody = (entityId: Physics3DEntityId): boolean =>
    backendMode === 'wasm' ? removeBodyWasm(entityId) : removeBodyLocal(entityId);

  const hasBody = (entityId: Physics3DEntityId): boolean =>
    bodyByEntity.has(toEntityIndex(entityId));

  const getBodyKind: Physics3DAPI['getBodyKind'] = (entityId) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return undefined;
      const k = wasmBridge!.physics3d_get_body_kind!(slot);
      return k === 255 ? undefined : kindFromU8(k);
    }
    return bodyByEntity.get(slot)?.kind;
  };

  const setBodyKind: Physics3DAPI['setBodyKind'] = (entityId, kind) => {
    const slot = toEntityIndex(entityId);
    const handle = bodyByEntity.get(slot);
    if (!handle) return false;
    handle.kind = kind;
    if (backendMode === 'wasm') {
      return wasmBridge!.physics3d_set_body_kind!(slot, kindToU8(kind)) ?? false;
    }
    return true;
  };

  const getBodyState: Physics3DAPI['getBodyState'] = (entityId) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return undefined;
      const arr = wasmBridge!.physics3d_get_body_state!(slot);
      if (!arr || arr.length < 13) return undefined;
      return parseBodyState(arr);
    }
    const state = stateByEntity.get(slot);
    return state ? cloneState(state) : undefined;
  };

  const setBodyState: Physics3DAPI['setBodyState'] = (entityId, patch) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return false;
      const idx = slot;
      const arr = wasmBridge!.physics3d_get_body_state!(idx);
      if (!arr || arr.length < 13) return false;
      const cur = parseBodyState(arr);
      const p = patch.position ? { ...cur.position, ...patch.position } : cur.position;
      const r = patch.rotation ? { ...cur.rotation, ...patch.rotation } : cur.rotation;
      const lv = patch.linearVelocity
        ? { ...cur.linearVelocity, ...patch.linearVelocity }
        : cur.linearVelocity;
      const av = patch.angularVelocity
        ? { ...cur.angularVelocity, ...patch.angularVelocity }
        : cur.angularVelocity;
      return (
        wasmBridge!.physics3d_set_body_state!(
          idx,
          p.x,
          p.y,
          p.z,
          r.x,
          r.y,
          r.z,
          r.w,
          lv.x,
          lv.y,
          lv.z,
          av.x,
          av.y,
          av.z,
        ) ?? false
      );
    }
    const current = stateByEntity.get(slot);
    if (!current) return false;
    if (patch.position) current.position = { ...current.position, ...patch.position };
    if (patch.rotation) current.rotation = { ...current.rotation, ...patch.rotation };
    if (patch.linearVelocity)
      current.linearVelocity = { ...current.linearVelocity, ...patch.linearVelocity };
    if (patch.angularVelocity)
      current.angularVelocity = { ...current.angularVelocity, ...patch.angularVelocity };
    return true;
  };

  const applyImpulse: Physics3DAPI['applyImpulse'] = (entityId, impulse) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return false;
      return (
        wasmBridge!.physics3d_apply_impulse!(
          slot,
          impulse.x ?? 0,
          impulse.y ?? 0,
          impulse.z ?? 0,
        ) ?? false
      );
    }
    const state = stateByEntity.get(slot);
    const handle = bodyByEntity.get(slot);
    if (!state || !handle) return false;
    const invMass = 1 / handle.mass;
    state.linearVelocity = {
      x: state.linearVelocity.x + (impulse.x ?? 0) * invMass,
      y: state.linearVelocity.y + (impulse.y ?? 0) * invMass,
      z: state.linearVelocity.z + (impulse.z ?? 0) * invMass,
    };
    return true;
  };

  const applyAngularImpulse: Physics3DAPI['applyAngularImpulse'] = (entityId, impulse) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return false;
      return (
        wasmBridge!.physics3d_apply_angular_impulse!(
          slot,
          impulse.x ?? 0,
          impulse.y ?? 0,
          impulse.z ?? 0,
        ) ?? false
      );
    }
    const state = stateByEntity.get(slot);
    const handle = bodyByEntity.get(slot);
    if (!state || !handle) return false;
    // Local approximation: apply angular impulse as direct velocity change
    const invMass = 1 / handle.mass;
    state.angularVelocity = {
      x: state.angularVelocity.x + (impulse.x ?? 0) * invMass,
      y: state.angularVelocity.y + (impulse.y ?? 0) * invMass,
      z: state.angularVelocity.z + (impulse.z ?? 0) * invMass,
    };
    return true;
  };

  const getLinearVelocity: Physics3DAPI['getLinearVelocity'] = (entityId) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return undefined;
      const arr = wasmBridge!.physics3d_get_linear_velocity!(slot);
      if (!arr || arr.length < 3) return undefined;
      return { x: arr[0] ?? 0, y: arr[1] ?? 0, z: arr[2] ?? 0 };
    }
    const state = stateByEntity.get(slot);
    return state ? { ...state.linearVelocity } : undefined;
  };

  const setLinearVelocity: Physics3DAPI['setLinearVelocity'] = (entityId, velocity) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return false;
      const arr = wasmBridge!.physics3d_get_linear_velocity!(slot);
      const cx = arr?.[0] ?? 0;
      const cy = arr?.[1] ?? 0;
      const cz = arr?.[2] ?? 0;
      return (
        wasmBridge!.physics3d_set_linear_velocity!(
          slot,
          velocity.x ?? cx,
          velocity.y ?? cy,
          velocity.z ?? cz,
        ) ?? false
      );
    }
    const state = stateByEntity.get(slot);
    if (!state) return false;
    state.linearVelocity = {
      x: velocity.x ?? state.linearVelocity.x,
      y: velocity.y ?? state.linearVelocity.y,
      z: velocity.z ?? state.linearVelocity.z,
    };
    return true;
  };

  const getAngularVelocity: Physics3DAPI['getAngularVelocity'] = (entityId) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return undefined;
      const arr = wasmBridge!.physics3d_get_angular_velocity!(slot);
      if (!arr || arr.length < 3) return undefined;
      return { x: arr[0] ?? 0, y: arr[1] ?? 0, z: arr[2] ?? 0 };
    }
    const state = stateByEntity.get(slot);
    return state ? { ...state.angularVelocity } : undefined;
  };

  const setAngularVelocity: Physics3DAPI['setAngularVelocity'] = (entityId, velocity) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return false;
      const arr = wasmBridge!.physics3d_get_angular_velocity!(slot);
      const cx = arr?.[0] ?? 0;
      const cy = arr?.[1] ?? 0;
      const cz = arr?.[2] ?? 0;
      return (
        wasmBridge!.physics3d_set_angular_velocity!(
          slot,
          velocity.x ?? cx,
          velocity.y ?? cy,
          velocity.z ?? cz,
        ) ?? false
      );
    }
    const state = stateByEntity.get(slot);
    if (!state) return false;
    state.angularVelocity = {
      x: velocity.x ?? state.angularVelocity.x,
      y: velocity.y ?? state.angularVelocity.y,
      z: velocity.z ?? state.angularVelocity.z,
    };
    return true;
  };

  const setKinematicPosition: Physics3DAPI['setKinematicPosition'] = (
    entityId,
    position,
    rotation,
  ) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm') {
      if (!bodyByEntity.has(slot)) return false;
      const r = rotation ?? { x: 0, y: 0, z: 0, w: 1 };
      return (
        wasmBridge!.physics3d_set_kinematic_position!(
          slot,
          position.x,
          position.y,
          position.z,
          r.x,
          r.y,
          r.z,
          r.w,
        ) ?? false
      );
    }
    const state = stateByEntity.get(slot);
    if (!state) return false;
    state.position = { ...position };
    if (rotation) state.rotation = { ...state.rotation, ...rotation };
    return true;
  };

  // ─── Collider management ──────────────────────────────────────────────────────

  /**
   * Internal implementation of addCollider — shared by createBody collider loop
   * and the public addCollider API method.
   */
  const addColliderImpl = (
    entityId: Physics3DEntityId,
    options: Physics3DColliderOptions,
  ): boolean => {
    const slot = toEntityIndex(entityId);
    if (!bodyByEntity.has(slot)) return false;

    const colliderId = options.colliderId ?? nextColliderIdForEntity(entityId);
    const finalOptions: Physics3DColliderOptions = { ...options, colliderId };

    // Always track in the local collider registry for inspection
    if (!localColliders.has(slot)) localColliders.set(slot, []);
    localColliders.get(slot)!.push(finalOptions);

    if (backendMode === 'wasm') {
      const idx = toEntityIndex(entityId);
      const { friction, restitution, density } = resolveColliderMaterial(finalOptions);
      const isSensor = finalOptions.isSensor ? 1 : 0;
      const membership = resolveLayerBits(finalOptions.layers, layerRegistry);
      const filter = resolveLayerBits(finalOptions.mask, layerRegistry);
      const ox = finalOptions.offsetX ?? 0;
      const oy = finalOptions.offsetY ?? 0;
      const oz = finalOptions.offsetZ ?? 0;
      const shape = finalOptions.shape;

      if (shape.type === 'box') {
        return (
          wasmBridge!.physics3d_add_box_collider?.(
            idx,
            shape.halfX,
            shape.halfY,
            shape.halfZ,
            friction,
            restitution,
            density,
            isSensor,
            membership,
            filter,
            colliderId,
            ox,
            oy,
            oz,
          ) ?? false
        );
      }
      if (shape.type === 'sphere') {
        return (
          wasmBridge!.physics3d_add_sphere_collider?.(
            idx,
            shape.radius,
            friction,
            restitution,
            density,
            isSensor,
            membership,
            filter,
            colliderId,
            ox,
            oy,
            oz,
          ) ?? false
        );
      }
      if (shape.type === 'capsule') {
        return (
          wasmBridge!.physics3d_add_capsule_collider?.(
            idx,
            shape.radius,
            shape.halfHeight,
            friction,
            restitution,
            density,
            isSensor,
            membership,
            filter,
            colliderId,
            ox,
            oy,
            oz,
          ) ?? false
        );
      }
    }

    return true;
  };

  const addCollider: Physics3DAPI['addCollider'] = (entityId, options) =>
    addColliderImpl(entityId, options);

  const removeCollider: Physics3DAPI['removeCollider'] = (entityId, colliderId) => {
    const slot = toEntityIndex(entityId);
    if (!bodyByEntity.has(slot)) return false;

    const colliders = localColliders.get(slot);
    if (colliders) {
      const idx = colliders.findIndex((c) => c.colliderId === colliderId);
      if (idx !== -1) colliders.splice(idx, 1);
    }

    if (backendMode === 'wasm') {
      return wasmBridge!.physics3d_remove_collider?.(slot, colliderId) ?? false;
    }

    return true;
  };

  // ─── Sensor state ─────────────────────────────────────────────────────────────

  const getSensorState: Physics3DAPI['getSensorState'] = (entityId, sensorId) => {
    const slot = toEntityIndex(entityId);
    if (backendMode === 'wasm' && wasmBridge!.physics3d_get_sensor_state) {
      const raw = wasmBridge!.physics3d_get_sensor_state(slot, sensorId);
      if (raw && (raw as unknown[]).length >= 2) {
        const contactCount = Number((raw as number[])[0]);
        const isActive = Number((raw as number[])[1]) !== 0;
        // Sync local cache
        let sensorMap = localSensorStates.get(slot);
        if (!sensorMap) {
          sensorMap = new Map();
          localSensorStates.set(slot, sensorMap);
        }
        sensorMap.set(sensorId, { contactCount, isActive });
        return { contactCount, isActive };
      }
    }
    return localSensorStates.get(slot)?.get(sensorId) ?? { contactCount: 0, isActive: false };
  };

  const updateSensorState: Physics3DAPI['updateSensorState'] = (
    entityId,
    sensorId,
    isActive,
    count,
  ) => {
    const slot = toEntityIndex(entityId);
    let sensorMap = localSensorStates.get(slot);
    if (!sensorMap) {
      sensorMap = new Map();
      localSensorStates.set(slot, sensorMap);
    }
    sensorMap.set(sensorId, { contactCount: count, isActive });
    if (backendMode === 'wasm' && wasmBridge!.physics3d_update_sensor_state) {
      wasmBridge!.physics3d_update_sensor_state(slot, sensorId, isActive ? 1 : 0, count);
    }
  };

  // ─── Collision event reading from WASM ring buffer ────────────────────────────

  /**
   * Read pending collision events from the WASM ring buffer.
   *
   * Event layout (17 bytes per slot):
   * [slotA u32 LE][slotB u32 LE][colliderIdA u32 LE][colliderIdB u32 LE][flags u8]
   * flags bit 0: 1 = contact started, 0 = contact ended
   */
  const readWasmCollisionEvents = (): InternalCollisionEvent3D[] => {
    if (!wasmBridge) return [];
    const pb = wasmBridge;
    if (!pb.physics3d_get_collision_events_ptr || !pb.physics3d_get_collision_event_count) {
      return [];
    }

    const memory = bridgeRuntime?.getLinearMemory?.() ?? pb.memory ?? null;
    if (!memory) return [];

    const ptr = pb.physics3d_get_collision_events_ptr();
    const count = Math.min(pb.physics3d_get_collision_event_count(), MAX_EVENTS_3D);
    if (count === 0) return [];

    // Build a DataView covering the available bytes from ptr to end of buffer.
    // We read only `count` events, so we do not require the full ring capacity.
    const availableBytes = memory.buffer.byteLength - ptr;
    if (availableBytes <= 0) return [];

    if (!eventsView || eventsBufferRef !== memory.buffer || eventsView.byteLength === 0) {
      eventsBufferRef = memory.buffer;
      eventsView = new DataView(memory.buffer, ptr, availableBytes);
    }

    // Reuse pooled array — grow if needed, truncate via length tracking
    pooledEvents.length = count;
    for (let i = 0; i < count; i++) {
      const base = i * EVENT_STRIDE_3D;
      // Rust layout: [entity_a u32][entity_b u32][flags u32][collider_a_id u16][collider_b_id u16]
      const slotA = eventsView.getUint32(base, true);
      const slotB = eventsView.getUint32(base + 4, true);
      const rawFlags = eventsView.getUint32(base + 8, true);
      const rawColliderA = eventsView.getUint16(base + 12, true);
      const rawColliderB = eventsView.getUint16(base + 14, true);

      const existing = pooledEvents[i];
      if (existing) {
        existing.slotA = slotA;
        existing.slotB = slotB;
        existing.aColliderId = rawColliderA === COLLIDER_ID_ABSENT ? undefined : rawColliderA;
        existing.bColliderId = rawColliderB === COLLIDER_ID_ABSENT ? undefined : rawColliderB;
        existing.started = (rawFlags & 1) === 1;
      } else {
        pooledEvents[i] = {
          slotA,
          slotB,
          aColliderId: rawColliderA === COLLIDER_ID_ABSENT ? undefined : rawColliderA,
          bColliderId: rawColliderB === COLLIDER_ID_ABSENT ? undefined : rawColliderB,
          started: (rawFlags & 1) === 1,
        };
      }
    }

    pb.physics3d_consume_events?.();
    lastFrameEventCount = count;
    return pooledEvents;
  };

  // ─── Service object ───────────────────────────────────────────────────────────

  const service: Physics3DAPI = {
    isReady: () => ready,
    variant: () => _variant,

    step: (deltaSeconds: number) => {
      if (!stepFn) {
        throw new Error('[GWEN:Physics3D] step() called before plugin initialization.');
      }
      stepFn(deltaSeconds);
      if (deltaSeconds > 0 && backendMode === 'local') {
        advanceLocalState(deltaSeconds);
      }
    },

    createBody,
    removeBody,
    hasBody,
    getBodyKind,
    setBodyKind,
    getBodyState,
    setBodyState,
    applyImpulse,
    applyAngularImpulse,
    getLinearVelocity,
    setLinearVelocity,
    getAngularVelocity,
    setAngularVelocity,
    setKinematicPosition,
    addCollider,
    removeCollider,
    getSensorState,
    updateSensorState,

    getCollisionContacts: (opts) =>
      opts?.max !== undefined ? currentFrameContacts.slice(0, opts.max) : currentFrameContacts,

    getCollisionEventMetrics: () => ({ eventCount: lastFrameEventCount }),

    getBodySnapshot: (entityId) => {
      if (!bodyByEntity.has(toEntityIndex(entityId))) return undefined;
      const state = getBodyState(entityId);
      return {
        entityId,
        position: state?.position ?? null,
        rotation: state?.rotation ?? null,
        linearVelocity: state?.linearVelocity ?? null,
        angularVelocity: state?.angularVelocity ?? null,
      };
    },

    getBodyCount: () => bodyByEntity.size,

    isDebugEnabled: () => cfg.debug,
  };

  // ─── Plugin lifecycle ─────────────────────────────────────────────────────────

  return {
    name: '@gwenjs/physics3d',
    meta: pluginMeta,

    setup(engine: GwenEngine): void {
      _engine = engine;
      const bridge = getWasmBridge() as unknown as Physics3DBridgeRuntime;
      _variant = bridge.variant;
      bridgeRuntime = bridge;

      if (_variant !== 'physics3d') {
        throw new Error(
          `[GWEN:Physics3D] Active core variant is "${_variant}". ` +
            'Use initWasm("physics3d") before starting the engine.',
        );
      }

      const pb = bridge.getPhysicsBridge();

      if (typeof pb.physics3d_init !== 'function') {
        throw new Error(
          '[GWEN:Physics3D] physics3d_init() is not available in current WASM exports.',
        );
      }

      pb.physics3d_init(cfg.gravity.x, cfg.gravity.y, cfg.gravity.z, cfg.maxEntities);

      if (typeof pb.physics3d_set_quality === 'function') {
        pb.physics3d_set_quality(QUALITY_PRESETS[cfg.qualityPreset]);
      }

      if (typeof pb.physics3d_set_event_coalescing === 'function') {
        pb.physics3d_set_event_coalescing(cfg.coalesceEvents ? 1 : 0);
      }

      stepFn = typeof pb.physics3d_step === 'function' ? pb.physics3d_step.bind(pb) : null;

      // Detect WASM backend: if physics3d_add_body is exported, delegate to Rapier3D
      if (typeof pb.physics3d_add_body === 'function') {
        backendMode = 'wasm';
        wasmBridge = pb;
      }

      ready = true;

      // Register prefab extension handler
      (engine.hooks as any).hook('prefab:instantiate', (entityId: unknown, extensions: unknown) => {
        const ext = (extensions as Record<string, unknown>)?.physics3d as
          | Physics3DPrefabExtension
          | undefined;
        if (!ext?.body) return;

        const eid = entityId as Physics3DEntityId;
        createBody(eid, ext.body);

        if (ext.onCollision) {
          const slot =
            typeof eid === 'bigint'
              ? unpackEntityId(eid as EntityId).index
              : typeof eid === 'number'
                ? eid
                : parseInt(String(eid), 10);
          entityCollisionCallbacks.set(slot, ext.onCollision);
        }
      });

      offEntityDestroyed = engine.hooks.hook('entity:destroy', (entityId: EntityId) => {
        if (
          typeof entityId === 'bigint' ||
          typeof entityId === 'number' ||
          typeof entityId === 'string'
        ) {
          const eid = entityId as Physics3DEntityId;
          const slot =
            typeof eid === 'bigint'
              ? Number((eid as bigint) & 0xffffffffn)
              : typeof eid === 'number'
                ? eid
                : parseInt(String(eid), 10);
          entityCollisionCallbacks.delete(slot);
          removeBody(eid);
          // Clean up all sensor states for this entity in O(1)
          localSensorStates.delete(slot);
        }
      });

      (engine as any).provide('physics3d', service);

      if (cfg.debug) {
        console.log(
          `[GWEN:Physics3D] Initialized. Backend=${backendMode} quality=${cfg.qualityPreset}`,
        );
      }
    },

    onBeforeUpdate(deltaTime: number): void {
      if (!ready || !stepFn) return;
      if (!(deltaTime > 0)) return;
      stepFn(deltaTime);
      if (backendMode === 'local') {
        advanceLocalState(deltaTime);
      }
    },

    onUpdate(): void {
      if (!ready || !_engine) return;

      // Invalidate DataView if memory buffer changed (memory.grow event)
      if (eventsView && backendMode === 'wasm') {
        const memory = bridgeRuntime?.getLinearMemory?.() ?? wasmBridge?.memory ?? null;
        if (memory && eventsBufferRef !== memory.buffer) {
          eventsView = null;
          eventsBufferRef = null;
        }
      }

      // Read events from WASM, or use the empty local events array
      const rawEvents = backendMode === 'wasm' ? readWasmCollisionEvents() : [];

      // Build resolved contacts
      const contacts: Physics3DCollisionContact[] = rawEvents.map((ev) => {
        const genA = bridgeRuntime?.getEntityGeneration?.(ev.slotA);
        const genB = bridgeRuntime?.getEntityGeneration?.(ev.slotB);
        return {
          entityA:
            genA !== undefined ? createEntityId(ev.slotA, genA) : (BigInt(ev.slotA) as EntityId),
          entityB:
            genB !== undefined ? createEntityId(ev.slotB, genB) : (BigInt(ev.slotB) as EntityId),
          ...(ev.aColliderId !== undefined ? { aColliderId: ev.aColliderId } : {}),
          ...(ev.bColliderId !== undefined ? { bColliderId: ev.bColliderId } : {}),
          started: ev.started,
        };
      });

      currentFrameContacts = contacts;

      if (contacts.length === 0) return;

      // Dispatch hook
      void (_engine.hooks as any).callHook('physics3d:collision', contacts);

      // Update sensor states and dispatch sensor:changed hook
      for (const ev of rawEvents) {
        for (const { slot, colliderId } of [
          { slot: ev.slotA, colliderId: ev.aColliderId },
          { slot: ev.slotB, colliderId: ev.bColliderId },
        ]) {
          if (colliderId === undefined) continue;

          // Find the entity this slot corresponds to
          const generation = bridgeRuntime?.getEntityGeneration?.(slot);
          if (generation === undefined) continue;
          const eid = createEntityId(slot, generation);

          const entitySlot = toEntityIndex(eid as unknown as Physics3DEntityId);
          let sensorMap = localSensorStates.get(entitySlot);
          if (!sensorMap) {
            sensorMap = new Map();
            localSensorStates.set(entitySlot, sensorMap);
          }
          const prev = sensorMap.get(colliderId) ?? { contactCount: 0, isActive: false };
          const newCount = ev.started ? prev.contactCount + 1 : Math.max(0, prev.contactCount - 1);
          const newActive = newCount > 0;
          const next: Physics3DSensorState = { contactCount: newCount, isActive: newActive };
          sensorMap.set(colliderId, next);

          if (prev.isActive !== newActive) {
            void (_engine.hooks as any).callHook('physics3d:sensor:changed', eid, colliderId, next);
          }
        }
      }

      // Dispatch per-entity collision callbacks
      for (const contact of contacts) {
        const slotA = unpackEntityId(contact.entityA).index;
        const slotB = unpackEntityId(contact.entityB).index;
        entityCollisionCallbacks.get(slotA)?.(contact.entityA, contact.entityB, contact);
        entityCollisionCallbacks.get(slotB)?.(contact.entityB, contact.entityA, contact);
      }
    },

    teardown(): void {
      if (offEntityDestroyed) {
        offEntityDestroyed();
        offEntityDestroyed = null;
      }
      ready = false;
      stepFn = null;
      backendMode = 'local';
      wasmBridge = null;
      bridgeRuntime = null;
      _engine = null;
      eventsView = null;
      eventsBufferRef = null;
      bodyByEntity.clear();
      stateByEntity.clear();
      localColliders.clear();
      localSensorStates.clear();
      entityCollisionCallbacks.clear();
      currentFrameContacts = [];
      lastFrameEventCount = 0;
      pooledEvents.length = 0;
    },
  };
});

// ─── Utility functions (module-private) ────────────────────────────────────────

/** Construct a fully-initialized Physics3DVec3 from a partial override. */
function vec3(v?: Partial<Physics3DVec3>): Physics3DVec3 {
  return { x: v?.x ?? 0, y: v?.y ?? 0, z: v?.z ?? 0 };
}

/** Construct a fully-initialized Physics3DQuat from a partial override. */
function quat(v?: Partial<Physics3DQuat>): Physics3DQuat {
  return { x: v?.x ?? 0, y: v?.y ?? 0, z: v?.z ?? 0, w: v?.w ?? 1 };
}

// ─── Public exports ─────────────────────────────────────────────────────────────

export { Physics3DPlugin as default };

export type {
  Physics3DAPI,
  Physics3DBodyOptions,
  Physics3DBodyHandle,
  Physics3DBodyKind,
  Physics3DBodyState,
  Physics3DBodySnapshot,
  Physics3DColliderOptions,
  Physics3DCollisionContact,
  Physics3DSensorState,
  Physics3DQualityPreset,
  Physics3DPrefabExtension,
  Physics3DPluginHooks,
  Physics3DVec3,
  Physics3DQuat,
  Physics3DConfig,
  Physics3DEntityId,
} from './types';

export { normalizePhysics3DConfig } from './config';
export { QUALITY_PRESETS } from './config';

export * from './helpers/contact';
export * from './helpers/movement';
export * from './helpers/queries';
export * from './systems';

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { usePhysics3D } from './composables.js';
export { default as physics3dModule } from './module.js';
