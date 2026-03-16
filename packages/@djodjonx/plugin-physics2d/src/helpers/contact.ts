import { createEntityId } from '@djodjonx/gwen-engine-core';
import type { EngineAPI } from '@djodjonx/gwen-engine-core';
import type { CollisionEvent, CollisionEventsBatch, ResolvedCollisionContact } from '../types.js';

/**
 * Filter collision events from a batch to those involving one specific entity slot.
 *
 * Checks both `slotA` and `slotB` of each event. Preserves source order.
 * Returns a new array on every call — does not mutate the batch.
 *
 * @param batch - Collision event batch from `physics.getCollisionEventsBatch()`.
 * @param entityIndex - Raw ECS slot index to filter on.
 * @returns All events where `slotA === entityIndex` or `slotB === entityIndex`.
 *
 * @example
 * ```ts
 * const mine = selectContactsForEntity(batch, playerSlot);
 * for (const ev of mine) handleContact(ev);
 * ```
 */
export function selectContactsForEntity(
  batch: CollisionEventsBatch,
  entityIndex: number,
): CollisionEvent[] {
  return batch.events.filter((e) => e.slotA === entityIndex || e.slotB === entityIndex);
}

/**
 * Remove duplicate events for the same contact pair and state within a frame.
 *
 * Pair identity is **order-independent**: `(A, B, started)` deduplicates `(B, A, started)`.
 * The **first** occurrence is kept; subsequent duplicates are dropped.
 * Output order is deterministic and matches input order of surviving events.
 *
 * Use this when `coalesceEvents` is disabled at the plugin level, or when
 * consuming events from multiple sources.
 *
 * @param events - Raw collision events, typically from a batch or filtered set.
 * @returns A new deduplicated array, preserving source order of first occurrences.
 *
 * @example
 * ```ts
 * const unique = dedupeContactsByPair(batch.events);
 * ```
 */
export function dedupeContactsByPair(events: ReadonlyArray<CollisionEvent>): CollisionEvent[] {
  const out: CollisionEvent[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    const min = Math.min(ev.slotA, ev.slotB);
    const max = Math.max(ev.slotA, ev.slotB);
    const key = `${min}:${max}:${ev.started ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
  }

  return out;
}

/**
 * Resolve raw slot-based collision events into packed `EntityId` contacts.
 *
 * Raw `CollisionEvent` objects carry only slot indices, not packed `EntityId` bigints.
 * This helper resolves each slot to a full `EntityId` by reading the entity
 * generation from the engine API, making the result safe to use with
 * `api.getComponent()` or `api.destroyEntity()`.
 *
 * Events for slots whose generation cannot be resolved (destroyed or unregistered
 * entities) are **silently skipped**.
 *
 * @param api - Engine API providing `getEntityGeneration(slot)`.
 * @param events - Raw collision events (slot-based).
 * @returns Resolved contacts with packed `EntityId`s, in source order.
 *
 * @example
 * ```ts
 * const contacts = toResolvedContacts(api, batch.events);
 * for (const { entityA, entityB, started } of contacts) {
 *   if (!started) continue;
 *   const tag = api.getComponent(entityA, Tag);
 * }
 * ```
 */
export function toResolvedContacts(
  api: EngineAPI,
  events: ReadonlyArray<CollisionEvent>,
): ResolvedCollisionContact[] {
  const out: ResolvedCollisionContact[] = [];

  for (const ev of events) {
    const genA = api.getEntityGeneration(ev.slotA);
    const genB = api.getEntityGeneration(ev.slotB);
    if (genA === undefined || genB === undefined) continue;

    out.push({
      entityA: createEntityId(ev.slotA, genA),
      entityB: createEntityId(ev.slotB, genB),
      slotA: ev.slotA,
      slotB: ev.slotB,
      started: ev.started,
      aColliderId: ev.aColliderId,
      bColliderId: ev.bColliderId,
    });
  }

  return out;
}
