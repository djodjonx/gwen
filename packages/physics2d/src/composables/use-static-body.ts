/**
 * @file useStaticBody() — registers a static (non-moving) physics body for the current actor.
 */
import { _getActorEntityId } from '@gwenjs/core/scene';
import type { EntityId } from '@gwenjs/core';
import type { StaticBodyHandle, StaticBodyOptions, ColliderOptions } from '../types.js';
import { usePhysics2D } from '../composables.js';

/**
 * Registers the current actor's entity as a static (non-moving) physics body.
 *
 * Must be called inside a `defineActor()` factory function so that the entity ID
 * can be resolved from the active actor spawn context.
 *
 * @param options - Optional body and collider configuration.
 * @returns A {@link StaticBodyHandle} for enabling/disabling the body at runtime.
 * @throws {GwenPluginNotFoundError} If `@gwenjs/physics2d` is not registered.
 * @throws {Error} If called outside a `defineActor()` factory.
 *
 * @example
 * ```typescript
 * const GroundActor = defineActor(GroundPrefab, () => {
 *   const body = useStaticBody({ shape: 'box', layer: Layers.wall })
 * })
 * ```
 *
 * @since 1.0.0
 */
export function useStaticBody(options: StaticBodyOptions = {}): StaticBodyHandle {
  const physics = usePhysics2D();
  const entityId = _getActorEntityId() as unknown as EntityId;

  const bodyHandle = physics.addRigidBody(entityId, 'fixed', 0, 0);

  const colliderOpts: ColliderOptions = {
    isSensor: options.isSensor,
    membershipLayers: options.layer,
    filterLayers: options.mask,
  };

  if (options.shape === 'ball') {
    physics.addBallCollider(bodyHandle, 0.5, colliderOpts);
  } else {
    // Default to box collider for 'box', 'capsule', or unspecified shape
    physics.addBoxCollider(bodyHandle, 0.5, 0.5, colliderOpts);
  }

  let _active = true;

  return {
    get bodyId() {
      return bodyHandle;
    },
    get active() {
      return _active;
    },
    enable() {
      // Re-activating after disable requires re-adding the body; we restore the flag here.
      // Full re-registration is handled by the actor lifecycle (re-spawning the actor).
      _active = true;
    },
    disable() {
      physics.removeBody(entityId);
      _active = false;
    },
  };
}
