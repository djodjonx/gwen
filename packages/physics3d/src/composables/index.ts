/**
 * @file Barrel export for all RFC-06 DX composables.
 *
 * Import individual composables from this file rather than from their
 * individual modules to benefit from tree-shaking and stable import paths.
 *
 * @example
 * ```typescript
 * import { useStaticBody, useBoxCollider, onContact } from '@gwenjs/physics3d'
 * ```
 */

export { useStaticBody } from './use-static-body.js';
export type { } from './use-static-body.js'; // re-export StaticBodyOptions3D via types.ts

export { useDynamicBody } from './use-dynamic-body.js';
export type { } from './use-dynamic-body.js'; // re-export DynamicBodyOptions3D via types.ts

export { useBoxCollider } from './use-box-collider.js';
export type { BoxColliderOptions3D } from './use-box-collider.js';

export { useSphereCollider } from './use-sphere-collider.js';
export type { SphereColliderOptions3D } from './use-sphere-collider.js';

export { useCapsuleCollider } from './use-capsule-collider.js';
export type { CapsuleColliderOptions3D } from './use-capsule-collider.js';

export { useMeshCollider } from './use-mesh-collider.js';
export type { MeshColliderOptions } from './use-mesh-collider.js';

export { useConvexCollider } from './use-convex-collider.js';
export type { ConvexColliderOptions } from './use-convex-collider.js';

export { defineLayers } from './define-layers.js';

export {
  onContact,
  _dispatchContactEvent,
  _clearContactCallbacks,
} from './on-contact.js';

export {
  onSensorEnter,
  onSensorExit,
  _dispatchSensorEnter,
  _dispatchSensorExit,
  _clearSensorCallbacks,
} from './on-sensor.js';
