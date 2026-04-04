/**
 * @gwenjs/physics2d
 *
 * 2D physics plugin for GWEN — pure adapter providing 2D rigid-body physics via the core WASM.
 * Public barrel exports. Implementation lives in ./plugin/ and ./composables/
 */

// ─── Plugin exports ─────────────────────────────────────────────────────────
export { Physics2DPlugin, Physics2D, physics2D } from './plugin/index.js';
export { ShapeComponent } from './plugin/shape-component.js';
export type { ShapeData } from './plugin/shape-component.js';
export { ContactRingBuffer, CONTACT_EVENT_BYTES, RING_CAPACITY } from './plugin/ring-buffer.js';

// ─── Module, composables & type augmentations ───────────────────────────────
export * from './augment.js';
export { usePhysics2D, useRigidBody, useCollider } from './composables.js';
export {
  useStaticBody,
  useDynamicBody,
  useBoxCollider,
  useSphereCollider,
  useCapsuleCollider,
  defineLayers,
  onContact,
  onSensorEnter,
  onSensorExit,
  _clearContactCallbacks,
  _clearSensorCallbacks,
  useShape,
} from './composables/index.js';
export { physics2dVitePlugin } from './vite-plugin.js';
export type {
  BoxColliderOptions,
  SphereColliderOptions,
  CapsuleColliderOptions,
  ShapeOptions,
} from './composables/index.js';
export type {
  StaticBodyOptions,
  StaticBodyHandle,
  DynamicBodyOptions,
  DynamicBodyHandle,
  BoxColliderHandle,
  CircleColliderHandle,
  CapsuleColliderHandle,
  ContactEvent,
  Physics2DLayerDefinition,
} from './types.js';

// ─── Re-export systems & helper utilities ───────────────────────────────────
export {
  createPhysicsKinematicSyncSystem,
  createPlatformerGroundedSystem,
  SENSOR_ID_FOOT,
} from './systems.js';
export { buildTilemapPhysicsChunks, patchTilemapPhysicsChunk } from './helpers/tilemap.js';
export type {
  PhysicsKinematicSyncSystemOptions,
  PlatformerGroundedSystemOptions,
} from './systems.js';

// ─── Re-export public types ───────────────────────────────────────────────
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
  PhysicsColliderDef,
  PhysicsQualityPreset,
  PhysicsColliderShape,
  SensorState,
  TilemapPhysicsChunkMap,
} from './types.js';

export {
  PHYSICS2D_BRIDGE_SCHEMA_VERSION,
  PHYSICS_QUALITY_PRESET_CODE,
  PHYSICS2D_WASM_EVENT_STRIDE,
} from './types.js';

export { default } from './module.js';
