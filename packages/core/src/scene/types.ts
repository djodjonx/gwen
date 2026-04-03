/**
 * @file Scene type definitions for the RFC-011 actor system.
 *
 * Exports shared callback types (`UpdateFn`, `RenderFn`, `VoidFn`) and the
 * core data structures (`ActorInstance`, `ActorPlugin`, `ActorDefinition`)
 * used by `defineActor`, `useActor`, and related composables.
 */

// packages/core/src/scene/types.ts
import type { GwenPlugin } from '../engine/gwen-engine.js';

// Prefab types live in core — re-exported here for convenience
export type { PrefabComponentEntry, PrefabDefinition } from '../define-prefab.js';
import type { PrefabDefinition } from '../define-prefab.js';

// ─── Actor ────────────────────────────────────────────────────────────────────

/**
 * Frame-update callback invoked every simulation tick with the elapsed time.
 *
 * Registered via `onUpdate()`, `onBeforeUpdate()`, or `onAfterUpdate()` inside
 * a `defineActor()` factory. Each live actor instance receives a separate call
 * every frame.
 *
 * @param dt - Elapsed time since the last frame, in **seconds**.
 */
export type UpdateFn = (dt: number) => void;

/**
 * Render-phase callback invoked once per render frame.
 *
 * Registered via `onRender()` inside a `defineActor()` factory. No delta-time
 * is provided — use this for draw calls and visual state synchronisation only.
 */
export type RenderFn = () => void;

/**
 * General-purpose no-argument, no-return callback.
 *
 * Used for actor lifecycle hooks that require no parameters, such as `onStart`
 * (called once immediately after spawn) and `onDestroy` (called once before
 * the actor's entity is removed from the ECS).
 */
export type VoidFn = () => void;

/**
 * Internal per-instance state tracked by the actor plugin for one spawned entity.
 *
 * Created during `spawn()` and populated by the actor factory via lifecycle
 * composables (`onStart`, `onUpdate`, `onDestroy`, etc.). The plugin iterates
 * these arrays every frame to dispatch callbacks in phase order.
 *
 * @template PublicAPI - The object returned by the actor factory and stored as `api`.
 * @internal
 */
export interface ActorInstance<PublicAPI = void> {
  /** ECS entity ID assigned to this instance at spawn time. */
  entityId: bigint;
  /** Callbacks registered via `onStart()` — fired once immediately after spawn. */
  _start: VoidFn[];
  /** Callbacks registered via `onBeforeUpdate()` — fired each frame before the main update. */
  _beforeUpdate: UpdateFn[];
  /** Callbacks registered via `onUpdate()` — fired each frame during the main update phase. */
  _update: UpdateFn[];
  /** Callbacks registered via `onAfterUpdate()` — fired each frame after the main update. */
  _afterUpdate: UpdateFn[];
  /** Callbacks registered via `onRender()` — fired each render frame. */
  _render: RenderFn[];
  /** Callbacks registered via `onDestroy()` — fired once immediately before despawn. */
  _destroy: VoidFn[];
  /** Cleanup fns for onEvent() — called on despawn to unregister engine hook handlers. */
  _eventCleanups: VoidFn[];
  /** Public API returned by the factory and exposed via `ActorHandle.get()` / `getAll()`. */
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
