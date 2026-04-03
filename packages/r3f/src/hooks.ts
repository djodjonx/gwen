/**
 * @file hooks — Reactive ECS hooks for React Three Fiber.
 *
 * Provides `useGwenQuery` and `useGwenComponent` — two hooks that expose the
 * GWEN ECS world to React components in a safe, tear-down-aware manner.
 *
 * Both hooks use `useSyncExternalStore` which guarantees:
 * - No tearing (React always reads a consistent snapshot).
 * - Proper subscription cleanup on unmount.
 * - Bail-out when the snapshot has not changed (stable reference comparison).
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { EntityId, ComponentDef } from '@gwenjs/core';
import type { ComponentDefinition, ComponentSchema, InferComponent } from '@gwenjs/core';
import { useGwenEngine } from './context.js';

// ─── useGwenQuery ─────────────────────────────────────────────────────────────

/**
 * Returns the list of entity IDs that currently match all supplied component
 * definitions. Re-renders the component whenever an entity is spawned or
 * destroyed (i.e. when the matching set changes).
 *
 * The returned array reference is **stable** when the set of matched entities
 * has not changed — React will bail out and skip re-rendering siblings that
 * receive it as a prop.
 *
 * @typeParam C - Tuple of component definitions used as query selectors.
 * @param components - Array of component definitions to match against.
 *   For best performance, define the array outside the component or wrap
 *   it in `useMemo` so the reference stays stable across renders.
 * @returns A stable-reference array of {@link EntityId} values.
 *
 * @example
 * ```tsx
 * import { Types, defineComponent } from '@gwenjs/core'
 * import { useGwenQuery } from '@gwenjs/r3f'
 *
 * const Position = defineComponent({ name: 'Position', schema: { x: Types.f32, y: Types.f32 } })
 * const Velocity = defineComponent({ name: 'Velocity', schema: { vx: Types.f32, vy: Types.f32 } })
 *
 * // Stable reference — defined outside the component:
 * const MOVING = [Position, Velocity]
 *
 * function MovingEntities() {
 *   const ids = useGwenQuery(MOVING)
 *   return <>{ids.map(id => <EntityMesh key={String(id)} entityId={id} />)}</>
 * }
 * ```
 *
 * @since 1.0.0
 */
export function useGwenQuery<C extends ComponentDef[]>(components: C): EntityId[] {
  const engine = useGwenEngine();

  /**
   * Stable snapshot cache — keeps the same array reference when the set of
   * matched entity IDs has not changed.
   */
  const snapshotRef = useRef<EntityId[]>([]);

  /**
   * Ref so getSnapshot always reads the latest `components` array without
   * needing it in the `useCallback` dependency list (avoids re-subscription
   * when inline arrays change identity on each render).
   */
  const componentsRef = useRef<C>(components);
  componentsRef.current = components;

  /**
   * Subscribe to entity lifecycle events.
   * Called once by `useSyncExternalStore`; returns an unsubscribe function.
   */
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offSpawn = engine.hooks.hook('entity:spawn', (_id: EntityId) => {
        onChange();
      });
      const offDestroy = engine.hooks.hook('entity:destroy', (_id: EntityId) => {
        onChange();
      });
      return (): void => {
        offSpawn();
        offDestroy();
      };
    },
    [engine],
  );

  /**
   * Snapshot function — evaluates the live query and returns a stable array.
   * If the matched IDs are identical to the previous snapshot, the same array
   * reference is returned so React bails out.
   */
  const getSnapshot = useCallback((): EntityId[] => {
    const ids: EntityId[] = [];
    for (const accessor of engine.createLiveQuery(componentsRef.current)) {
      ids.push(accessor.id);
    }

    const prev = snapshotRef.current;
    if (prev.length === ids.length && ids.every((id, i) => id === prev[i])) {
      return prev;
    }

    snapshotRef.current = ids;
    return ids;
  }, [engine]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ─── useGwenComponent ────────────────────────────────────────────────────────

/**
 * Returns the current component data for a specific entity, or `undefined`
 * if the entity does not have the component attached.
 *
 * Re-renders whenever the engine fires `engine:afterTick` (i.e. once per
 * game step) and the component data reference has changed.
 *
 * @typeParam C - The component definition type (inferred automatically).
 * @param entityId - ID of the entity to read.
 * @param component - Component definition produced by `defineComponent`.
 * @returns The component data typed as {@link InferComponent}`<C>`, or
 *   `undefined` when the entity does not carry this component.
 *
 * @example
 * ```tsx
 * import { Types, defineComponent } from '@gwenjs/core'
 * import { useGwenComponent } from '@gwenjs/r3f'
 *
 * const Health = defineComponent({
 *   name: 'Health',
 *   schema: { current: Types.f32, max: Types.f32 },
 * })
 *
 * function HealthBar({ entityId }: { entityId: EntityId }) {
 *   const health = useGwenComponent(entityId, Health)
 *   if (!health) return null
 *   return <div>{health.current} / {health.max}</div>
 * }
 * ```
 *
 * @since 1.0.0
 */
export function useGwenComponent<C extends ComponentDefinition<ComponentSchema>>(
  entityId: EntityId,
  component: C,
): InferComponent<C> | undefined {
  const engine = useGwenEngine();

  /**
   * Subscribe to tick and entity lifecycle events so the snapshot is
   * re-evaluated at the appropriate times.
   */
  const subscribe = useCallback(
    (onChange: () => void) => {
      const offTick = engine.hooks.hook('engine:afterTick', (_dt: number) => {
        onChange();
      });
      const offDestroy = engine.hooks.hook('entity:destroy', (_id: EntityId) => {
        onChange();
      });
      return (): void => {
        offTick();
        offDestroy();
      };
    },
    [engine],
  );

  /**
   * Snapshot function — reads the component value directly from ECS storage.
   * React's `useSyncExternalStore` uses `Object.is` to compare successive
   * snapshots; re-rendering only occurs when the reference changes.
   */
  const getSnapshot = useCallback(
    (): InferComponent<C> | undefined => engine.getComponent(entityId, component),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, entityId, component],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
