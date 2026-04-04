/**
 * @file useMeshCollider() — attaches a trimesh collider to the current entity.
 *
 * **3D only — not available in \@gwenjs/physics2d.**
 *
 * A mesh collider uses a triangle mesh for precise concave collision geometry.
 * It is more expensive than convex or primitive shapes, so prefer convex or
 * primitive shapes for dynamic bodies. Mesh colliders are best suited for
 * static terrain and environment geometry.
 */
import type { MeshColliderHandle3D } from '../types.js';
import { usePhysics3D } from '../composables.js';
import { _getActorEntityId } from '@gwenjs/core/scene';
import type { EntityId } from '@gwenjs/core';
import { nextColliderId } from './collider-id.js';

/**
 * Options for configuring a trimesh (triangle mesh) 3D collider.
 *
 * **3D only — not available in \@gwenjs/physics2d.**
 */
export interface MeshColliderOptions {
  /**
   * Flat array of vertex positions in metres.
   * Layout: `[x0, y0, z0, x1, y1, z1, ...]`.
   * Length must be a multiple of 3.
   */
  vertices: Float32Array;
  /**
   * Flat array of triangle indices into the vertex array.
   * Layout: `[a0, b0, c0, a1, b1, c1, ...]`.
   * Length must be a multiple of 3.
   */
  indices: Uint32Array;
  /** Mark as sensor — generates events but no physical response. @default false */
  isSensor?: boolean;
  /** Numeric collision layer bitmask (membership). */
  layer?: number;
  /** Numeric collision filter bitmask (which layers to collide with). */
  mask?: number;
}

/**
 * Attach a trimesh collider to the current entity.
 *
 * **3D only — not available in \@gwenjs/physics2d.**
 *
 * Must be called after {@link useStaticBody} or {@link useDynamicBody} has
 * registered the body for this entity. Mesh colliders are recommended for
 * static bodies only; using them on dynamic bodies incurs significant performance
 * overhead in the Rapier3D solver.
 *
 * @param options - Vertex and index arrays, plus optional sensor/layer config.
 * @returns A {@link MeshColliderHandle3D} with a stable `colliderId` and a `remove()` method.
 * @throws {GwenPluginNotFoundError} If `@gwenjs/physics3d` is not registered.
 *
 * @example
 * ```typescript
 * const TerrainActor = defineActor(TerrainPrefab, () => {
 *   useStaticBody()
 *   useMeshCollider({ vertices: terrainVerts, indices: terrainIndices })
 * })
 * ```
 *
 * @since 1.0.0
 */
export function useMeshCollider(options: MeshColliderOptions): MeshColliderHandle3D {
  const physics = usePhysics3D();
  const entityId = _getActorEntityId() as unknown as EntityId;
  const colliderId = nextColliderId();

  physics.addCollider(entityId, {
    shape: {
      type: 'mesh',
      vertices: options.vertices,
      indices: options.indices,
    },
    isSensor: options.isSensor,
    colliderId,
  });

  return {
    get colliderId() {
      return colliderId;
    },
    remove() {
      physics.removeCollider(entityId, colliderId);
    },
  };
}
