/// <reference types="vite/client" />

/**
 * @gwenjs/physics3d
 *
 * 3D physics plugin for GWEN — Rapier3D adapter with full collider, sensor,
 * collision event, and layer support. Falls back to a deterministic local
 * TypeScript simulation when the WASM physics3d variant is unavailable.
 */

import './augment.js';

export { Physics3DPlugin } from './plugin/index.js';
export { Physics3DPlugin as default } from './plugin/index.js';
export type { PreloadedBvhHandle } from './plugin/bvh.js';
export { _clearBvhCache, preloadMeshCollider } from './plugin/bvh.js';
export { EVENT_STRIDE_3D, MAX_EVENTS_3D, COLLIDER_ID_ABSENT } from './plugin/constants.js';
export {
  ContactRingBuffer3D,
  CONTACT_EVENT_FLOATS,
  RING_CAPACITY_3D,
} from './plugin/ring-buffer.js';

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

// ─── RFC-06 DX composables ────────────────────────────────────────────────────
export * from './composables/index.js';
export { physics3dVitePlugin, createGwenPhysics3DPlugin } from './vite-plugin.js';
export type {
  ContactEvent3D,
  StaticBodyOptions3D,
  DynamicBodyOptions3D,
  StaticBodyHandle3D,
  DynamicBodyHandle3D,
  ColliderHandle3D,
  BoxColliderHandle3D,
  SphereColliderHandle3D,
  CapsuleColliderHandle3D,
  MeshColliderHandle3D,
  MeshColliderOptions,
  ConvexColliderHandle3D,
  HeightfieldColliderHandle3D,
  CompoundColliderHandle3D,
  CompoundShapeSpec,
  CompoundColliderOptions3D,
} from './types.js';

export type { BulkStaticBoxesOptions, BulkStaticBoxesResult } from './types.js';
