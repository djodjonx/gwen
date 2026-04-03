/**
 * @file hooks.bench.ts — Performance benchmarks for useGwenQuery snapshot evaluation.
 *
 * Measures the raw cost of iterating a live query and building a stable-reference
 * entity ID array — the hot path inside `useGwenQuery`'s `getSnapshot` function.
 *
 * Run with: `pnpm --filter @gwenjs/r3f bench`
 */

import { bench, describe } from 'vitest';
import { createEntityId, type EntityId } from '@gwenjs/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a deterministic array of entity IDs of the requested size.
 *
 * @param count - Number of entity IDs to generate.
 * @returns Array of packed EntityId bigints.
 */
function buildEntities(count: number): EntityId[] {
  const ids: EntityId[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(createEntityId(i, 0));
  }
  return ids;
}

/**
 * Returns a minimal live-query iterable backed by the supplied array.
 * Mirrors the shape returned by `GwenEngine.createLiveQuery`.
 */
function makeLiveQuery(ids: EntityId[]): Iterable<{ id: EntityId }> {
  return {
    [Symbol.iterator](): Iterator<{ id: EntityId }> {
      let i = 0;
      return {
        next(): IteratorResult<{ id: EntityId }> {
          if (i >= ids.length) return { done: true, value: undefined as never };
          return { done: false, value: { id: ids[i++]! } };
        },
      };
    },
  };
}

/**
 * Simulates the `getSnapshot` function inside `useGwenQuery`:
 * iterate the live query, collect entity IDs, and return a stable array
 * reference when the set has not changed.
 *
 * @param query - Live query iterable.
 * @param prev - Previously cached snapshot array.
 * @returns Either `prev` (same reference) or a new array.
 */
function evaluateSnapshot(query: Iterable<{ id: EntityId }>, prev: EntityId[]): EntityId[] {
  const ids: EntityId[] = [];
  for (const accessor of query) {
    ids.push(accessor.id);
  }
  if (prev.length === ids.length && ids.every((id, i) => id === prev[i])) {
    return prev;
  }
  return ids;
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

describe('useGwenQuery snapshot evaluation', () => {
  const entities100 = buildEntities(100);
  const entities1000 = buildEntities(1_000);

  /**
   * Baseline: no-change path (returns previous stable reference).
   * This is the hot path in steady state when no entities spawn or die.
   */
  bench('query re-evaluation — 100 entities (stable, no-change path)', () => {
    const query = makeLiveQuery(entities100);
    let snapshot = entities100.slice(); // initial snapshot
    snapshot = evaluateSnapshot(query, snapshot);
  });

  bench('query re-evaluation — 1 000 entities (stable, no-change path)', () => {
    const query = makeLiveQuery(entities1000);
    let snapshot = entities1000.slice(); // initial snapshot
    snapshot = evaluateSnapshot(query, snapshot);
  });

  /**
   * Change path: a new entity array is returned every evaluation.
   * Triggered when an entity:spawn / entity:destroy event fires.
   */
  bench('query re-evaluation — 100 entities (change path, new array)', () => {
    const ids = buildEntities(100);
    const query = makeLiveQuery(ids);
    evaluateSnapshot(query, []); // force new array path
  });

  bench('query re-evaluation — 1 000 entities (change path, new array)', () => {
    const ids = buildEntities(1_000);
    const query = makeLiveQuery(ids);
    evaluateSnapshot(query, []); // force new array path
  });
});
