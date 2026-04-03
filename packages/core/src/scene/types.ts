// packages/core/src/scene/types.ts
import type { GwenPlugin } from '../engine/gwen-engine.js';

// ─── Prefab ───────────────────────────────────────────────────────────────────

/**
 * A component entry in a prefab: component definition reference + default values.
 * Kept intentionally generic to avoid coupling to the ECS schema types.
 */
export interface PrefabComponentEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaults: Record<string, any>;
}

/**
 * Defines the memory layout of an actor: a list of components + default values.
 * Produced by `definePrefab()`.
 */
export interface PrefabDefinition {
  /** Debug name (injected by Vite transform, else 'anonymous'). */
  readonly __prefabName__: string;
  /** Declared components, in insertion order. */
  readonly components: PrefabComponentEntry[];
}

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
 * Definition of an actor produced by `defineActor()`.
 */
export interface ActorDefinition<Props = void, PublicAPI = void> {
  /** Internal ECS plugin — pass to `engine.use()`. */
  readonly _plugin: GwenPlugin;
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
