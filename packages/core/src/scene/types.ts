// packages/core/src/scene/types.ts
import type { GwenPlugin } from '../engine/gwen-engine.js';

// Prefab types live in core — re-exported here for convenience
export type { PrefabComponentEntry, PrefabDefinition } from '../define-prefab.js';
import type { PrefabDefinition } from '../define-prefab.js';

// ─── Actor ────────────────────────────────────────────────────────────────────

/** Update callback, receives dt in seconds. */
export type UpdateFn = (dt: number) => void;

/** Render callback (no dt). */
export type RenderFn = () => void;

/** Generic no-arg callback. */
export type VoidFn = () => void;

/**
 * Internal state of one actor instance (per entity).
 * Collected during factory execution in `spawn()`.
 */
export interface ActorInstance<PublicAPI = void> {
  /** Associated ECS entity ID. */
  entityId: bigint;
  _start: VoidFn[];
  _beforeUpdate: UpdateFn[];
  _update: UpdateFn[];
  _afterUpdate: UpdateFn[];
  _render: RenderFn[];
  _destroy: VoidFn[];
  /** Cleanup fns for onEvent() — called on despawn. */
  _eventCleanups: VoidFn[];
  /** Public API returned by the factory. */
  api: PublicAPI;
}

/**
 * Actor plugin that extends {@link GwenPlugin} with `spawn` and `despawn` methods.
 *
 * These methods are not part of the standard `GwenPlugin` interface; they are
 * exposed here for internal use by `defineActor` and `useActor`.
 *
 * @template Props - The props type accepted by `spawn`.
 */
export interface ActorPlugin<Props = void> extends GwenPlugin {
  /**
   * Spawn a new actor instance.
   *
   * @param props - Optional props forwarded to the actor factory.
   * @returns The ECS entity ID of the spawned instance.
   */
  spawn(props?: Props): bigint;

  /**
   * Despawn the actor instance associated with the given entity ID.
   * Calls all `_destroy` callbacks and event cleanups before destroying the entity.
   *
   * @param entityId - The entity ID returned by `spawn`.
   */
  despawn(entityId: bigint): void;
}

/**
 * Definition of an actor produced by `defineActor()`.
 */
export interface ActorDefinition<Props = void, PublicAPI = void> {
  /** Internal ECS plugin — pass to `engine.use()`. */
  readonly _plugin: ActorPlugin<Props>;
  /** Live instance registry (entityId → instance). */
  readonly _instances: Map<bigint, ActorInstance<PublicAPI>>;
  /** Prefab declaring memory layout. */
  readonly _prefab: PrefabDefinition;
  /** Debug name (injected by Vite transform, else 'anonymous'). @internal */
  readonly __actorName__: string;
  /** @internal Type marker for Props inference. */
  readonly __props__: Props;
  /** @internal Type marker for PublicAPI inference. */
  readonly __api__: PublicAPI;
}
