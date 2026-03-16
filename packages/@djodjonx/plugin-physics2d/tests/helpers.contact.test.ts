import { createEntityId } from '@djodjonx/gwen-engine-core';
import { describe, expect, it } from 'vitest';
import {
  dedupeContactsByPair,
  selectContactsForEntity,
  toResolvedContacts,
} from '../src/helpers/contact.ts';

describe('contact helpers', () => {
  it('should select events for one slot', () => {
    const selected = selectContactsForEntity(
      {
        frame: 1,
        count: 3,
        droppedSinceLastRead: 0,
        droppedCritical: 0,
        droppedNonCritical: 0,
        coalesced: true,
        events: [
          { slotA: 1, slotB: 2, started: true },
          { slotA: 7, slotB: 1, started: false },
          { slotA: 3, slotB: 4, started: true },
        ],
      },
      1,
    );

    expect(selected).toHaveLength(2);
  });

  it('should return empty array when no events match the slot', () => {
    const selected = selectContactsForEntity(
      {
        frame: 1,
        count: 1,
        droppedSinceLastRead: 0,
        droppedCritical: 0,
        droppedNonCritical: 0,
        coalesced: true,
        events: [{ slotA: 5, slotB: 6, started: true }],
      },
      99,
    );

    expect(selected).toHaveLength(0);
  });

  it('should return empty array when batch has no events', () => {
    const selected = selectContactsForEntity(
      {
        frame: 1,
        count: 0,
        droppedSinceLastRead: 0,
        droppedCritical: 0,
        droppedNonCritical: 0,
        coalesced: true,
        events: [],
      },
      1,
    );

    expect(selected).toHaveLength(0);
  });

  it('should dedupe symmetric pairs deterministically', () => {
    const deduped = dedupeContactsByPair([
      { slotA: 1, slotB: 2, started: true },
      { slotA: 2, slotB: 1, started: true },
      { slotA: 1, slotB: 2, started: false },
    ]);

    expect(deduped).toEqual([
      { slotA: 1, slotB: 2, started: true },
      { slotA: 1, slotB: 2, started: false },
    ]);
  });

  it('should return empty array when input is empty', () => {
    expect(dedupeContactsByPair([])).toEqual([]);
  });

  it('should keep ended events separate from started events for same pair', () => {
    const deduped = dedupeContactsByPair([
      { slotA: 1, slotB: 2, started: true },
      { slotA: 1, slotB: 2, started: false },
    ]);

    expect(deduped).toHaveLength(2);
  });

  it('should resolve slots into packed entity ids', () => {
    const api = {
      getEntityGeneration(slot: number) {
        return slot === 1 || slot === 2 ? 3 : undefined;
      },
    } as any;

    const resolved = toResolvedContacts(api, [{ slotA: 1, slotB: 2, started: true }]);

    expect(resolved).toEqual([
      {
        entityA: createEntityId(1, 3),
        entityB: createEntityId(2, 3),
        slotA: 1,
        slotB: 2,
        started: true,
        aColliderId: undefined,
        bColliderId: undefined,
      },
    ]);
  });

  it('should preserve colliderId fields when present', () => {
    const api = {
      getEntityGeneration: () => 1,
    } as any;

    const resolved = toResolvedContacts(api, [
      { slotA: 0, slotB: 1, started: true, aColliderId: 10, bColliderId: 20 },
    ]);

    expect(resolved[0].aColliderId).toBe(10);
    expect(resolved[0].bColliderId).toBe(20);
  });

  it('should skip unresolved entity A', () => {
    const api = {
      getEntityGeneration(slot: number) {
        return slot === 2 ? 1 : undefined;
      },
    } as any;

    const resolved = toResolvedContacts(api, [{ slotA: 1, slotB: 2, started: true }]);
    expect(resolved).toHaveLength(0);
  });

  it('should skip unresolved entity B', () => {
    const api = {
      getEntityGeneration(slot: number) {
        return slot === 1 ? 1 : undefined;
      },
    } as any;

    const resolved = toResolvedContacts(api, [{ slotA: 1, slotB: 2, started: true }]);
    expect(resolved).toHaveLength(0);
  });

  it('should return empty array when input events list is empty', () => {
    const api = { getEntityGeneration: () => 1 } as any;
    expect(toResolvedContacts(api, [])).toEqual([]);
  });
});
