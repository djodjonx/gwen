/**
 * PR-01 — Query System v2 tests
 *
 * Covers:
 * - SystemQueryDescriptor all/any/none/tag filters (QueryEngine.resolve)
 * - EntityAccessor get/set/has
 * - QueryResultImpl iteration and length
 * - buildQueryResult + resolveSystemQueryIds helpers
 * - defineSystem query field + onUpdate injection (via plugin-manager mock)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/core/ecs';
import {
  buildQueryResult,
  resolveSystemQueryIds,
  QueryResultImpl,
  type SystemQuery,
} from '../src/core/query-result';
import { defineSystem } from '../src/plugin-system/system';
import { defineComponent, Types } from '../src/schema';
import type { EngineAPI } from '../src/types/engine-api';
import type { EntityId } from '../src/types/entity';
import { createEntityId } from '../src/engine/engine-api';

// ── Test components ────────────────────────────────────────────────────────────

const Position = defineComponent({ name: 'Position', schema: { x: Types.f32, y: Types.f32 } });
const Velocity = defineComponent({ name: 'Velocity', schema: { vx: Types.f32, vy: Types.f32 } });
const Health = defineComponent({ name: 'Health', schema: { hp: Types.f32 } });
const Frozen = defineComponent({ name: 'Frozen', schema: {} });

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEcs(maxEntities = 20) {
  const em = new EntityManager(maxEntities);
  const cr = new ComponentRegistry();
  const qe = new QueryEngine();
  return { em, cr, qe };
}

/** Build a minimal EngineAPI mock for query-result tests. */
function makeApiMock(
  entityIds: EntityId[],
  componentData: Map<string, Map<EntityId, unknown>>,
): EngineAPI {
  const component = {
    has(id: EntityId, type: any): boolean {
      const name = typeof type === 'string' ? type : type.name;
      return componentData.get(name)?.has(id) ?? false;
    },
    get(id: EntityId, type: any): unknown {
      const name = typeof type === 'string' ? type : type.name;
      return componentData.get(name)?.get(id);
    },
    add(id: EntityId, type: any, data: unknown): void {
      const name = typeof type === 'string' ? type : type.name;
      if (!componentData.has(name)) componentData.set(name, new Map());
      componentData.get(name)!.set(id, data);
    },
    set(id: EntityId, type: any, patch: unknown): void {
      const name = typeof type === 'string' ? type : type.name;
      const current = componentData.get(name)?.get(id) ?? {};
      if (!componentData.has(name)) componentData.set(name, new Map());
      componentData.get(name)!.set(id, { ...(current as object), ...(patch as object) });
    },
    remove(_id: EntityId, _type: any): boolean {
      return false;
    },
    getOrThrow(id: EntityId, type: any): unknown {
      const val = component.get(id, type);
      if (val === undefined) throw new Error('[GWEN] component.getOrThrow: not found');
      return val;
    },
  };

  return {
    query(types: any[]) {
      const typeNames = types.map((t: any) => (typeof t === 'string' ? t : t.name));
      if (typeNames.length === 0) return [...entityIds];
      return entityIds.filter((id) =>
        typeNames.every((name) => componentData.get(name)?.has(id) ?? false),
      );
    },
    component,
    entity: {
      create(): EntityId {
        return 0n as unknown as EntityId;
      },
      destroy(): boolean {
        return false;
      },
      isAlive(): boolean {
        return true;
      },
      getGeneration(): number {
        return 0;
      },
      tag(): void {},
      untag(): void {},
      hasTag(): boolean {
        return false;
      },
    },
  } as unknown as EngineAPI;
}

// ── QueryEngine.resolve() ──────────────────────────────────────────────────────

describe('QueryEngine.resolve()', () => {
  let em: EntityManager;
  let cr: ComponentRegistry;
  let qe: QueryEngine;
  let e1: EntityId, e2: EntityId, e3: EntityId;

  beforeEach(() => {
    ({ em, cr, qe } = makeEcs());
    e1 = em.create();
    e2 = em.create();
    e3 = em.create();

    cr.add(e1, Position, { x: 0, y: 0 });
    cr.add(e1, Velocity, { vx: 1, vy: 0 });
    cr.add(e2, Position, { x: 10, y: 0 });
    cr.add(e3, Velocity, { vx: 0, vy: 1 });
    cr.add(e3, Health, { hp: 100 });
  });

  it('short form [] is treated as all:[]', () => {
    const results = qe.resolve([], em, cr);
    expect(results.length).toBe(3);
  });

  it('short form ComponentDef[] works as all filter', () => {
    const results = qe.resolve([Position, Velocity], em, cr);
    expect(results).toEqual([e1]);
  });

  it('descriptor all: [] returns all alive entities', () => {
    const results = qe.resolve({ all: [] }, em, cr);
    expect(results.length).toBe(3);
  });

  it('descriptor all: [Position] returns entities with Position', () => {
    const results = qe.resolve({ all: [Position] }, em, cr);
    expect(results).toContain(e1);
    expect(results).toContain(e2);
    expect(results).not.toContain(e3);
  });

  it('descriptor any: [...] returns entities with at least one', () => {
    const results = qe.resolve({ any: [Position, Health] }, em, cr);
    // e1 has Position, e2 has Position, e3 has Health
    expect(results).toContain(e1);
    expect(results).toContain(e2);
    expect(results).toContain(e3);
  });

  it('descriptor none: [...] excludes entities with those components', () => {
    const results = qe.resolve({ all: [Velocity], none: [Health] }, em, cr);
    // e1 has Velocity, no Health → included
    // e3 has Velocity AND Health → excluded
    expect(results).toContain(e1);
    expect(results).not.toContain(e3);
  });

  it('descriptor tag: string filters by marker-component name', () => {
    // Add a 'Player' marker to e1
    cr.add(e1, 'Player', {});

    const results = qe.resolve({ tag: 'Player' }, em, cr);
    expect(results).toEqual([e1]);
  });

  it('combined all + none', () => {
    const results = qe.resolve({ all: [Position], none: [Velocity] }, em, cr);
    // e1 has Position AND Velocity → excluded
    // e2 has Position only → included
    expect(results).toEqual([e2]);
  });
});

// ── resolveSystemQueryIds (via API mock) ──────────────────────────────────────

describe('resolveSystemQueryIds()', () => {
  let ids: EntityId[];
  let data: Map<string, Map<EntityId, unknown>>;
  let api: EngineAPI;

  beforeEach(() => {
    ids = [createEntityId(0, 0), createEntityId(1, 0), createEntityId(2, 0)];
    data = new Map([
      [
        'Position',
        new Map([
          [ids[0], { x: 0 }],
          [ids[1], { x: 1 }],
        ]),
      ],
      [
        'Velocity',
        new Map([
          [ids[0], { vx: 1 }],
          [ids[2], { vx: 2 }],
        ]),
      ],
      ['Frozen', new Map([[ids[1], {}]])],
    ]);
    api = makeApiMock(ids, data);
  });

  it('short form: ComponentDef[] resolves all filter', () => {
    const result = resolveSystemQueryIds([Position, Velocity], api);
    expect(result).toEqual([ids[0]]);
  });

  it('none filter excludes correctly', () => {
    const result = resolveSystemQueryIds({ all: [Position], none: [Frozen] }, api);
    // ids[0] has Position, no Frozen → included
    // ids[1] has Position AND Frozen → excluded
    expect(result).toEqual([ids[0]]);
  });

  it('any filter — at least one component', () => {
    const result = resolveSystemQueryIds({ any: [Position, Velocity] }, api);
    expect(result).toContain(ids[0]);
    expect(result).toContain(ids[1]);
    expect(result).toContain(ids[2]);
  });

  it('tag filter — marker component', () => {
    data.set('Player', new Map([[ids[0], {}]]));
    const result = resolveSystemQueryIds({ tag: 'Player' }, api);
    expect(result).toEqual([ids[0]]);
  });

  it('empty descriptor returns all entities', () => {
    const result = resolveSystemQueryIds({}, api);
    expect(result.length).toBe(3);
  });
});

// ── QueryResultImpl ───────────────────────────────────────────────────────────

describe('QueryResultImpl', () => {
  let ids: EntityId[];
  let data: Map<string, Map<EntityId, unknown>>;
  let api: EngineAPI;

  beforeEach(() => {
    ids = [createEntityId(0, 0), createEntityId(1, 0)];
    data = new Map([
      [
        'Health',
        new Map([
          [ids[0], { hp: 50 }],
          [ids[1], { hp: 100 }],
        ]),
      ],
    ]);
    api = makeApiMock(ids, data);
  });

  it('length matches ids', () => {
    const result = new QueryResultImpl(ids, api);
    expect(result.length).toBe(2);
  });

  it('is iterable via for...of', () => {
    const result = new QueryResultImpl(ids, api);
    const seen: EntityId[] = [];
    for (const e of result) {
      seen.push(e.id);
    }
    expect(seen).toEqual(ids);
  });

  it('toArray() returns a snapshot of ids', () => {
    const result = new QueryResultImpl(ids, api);
    expect(result.toArray()).toEqual(ids);
  });

  it('EntityAccessor.get returns component data', () => {
    const result = new QueryResultImpl(ids, api);
    for (const e of result) {
      const health = e.get(Health);
      expect(health).toBeDefined();
      expect(typeof health!.hp).toBe('number');
    }
  });

  it('EntityAccessor.has returns true for present component', () => {
    const result = new QueryResultImpl(ids, api);
    for (const e of result) {
      expect(e.has(Health)).toBe(true);
    }
  });

  it('EntityAccessor.has returns false for absent component', () => {
    const result = new QueryResultImpl(ids, api);
    for (const e of result) {
      expect(e.has(Position)).toBe(false);
    }
  });

  it('EntityAccessor.set patches component data', () => {
    const result = new QueryResultImpl([ids[0]], api);
    for (const e of result) {
      e.set(Health, { hp: 75 });
    }
    expect(data.get('Health')!.get(ids[0])).toMatchObject({ hp: 75 });
  });

  it('empty QueryResult has length 0 and iterates zero times', () => {
    const result = new QueryResultImpl([], api);
    expect(result.length).toBe(0);
    let count = 0;
    for (const _ of result) count++;
    expect(count).toBe(0);
  });
});

// ── buildQueryResult integration ──────────────────────────────────────────────

describe('buildQueryResult()', () => {
  it('returns a QueryResult with correct length', () => {
    const ids = [createEntityId(0, 0), createEntityId(1, 0)];
    const data = new Map([['Position', new Map(ids.map((id) => [id, { x: 0 }]))]]);
    const api = makeApiMock(ids, data);

    const result = buildQueryResult([Position], api);
    expect(result.length).toBe(2);
  });
});

// ── defineSystem query field ──────────────────────────────────────────────────

describe('defineSystem with query', () => {
  it('preserves query field on direct form', () => {
    const MovementSystem = defineSystem({
      name: 'MovementSystem',
      query: [Position, Velocity],
      onUpdate(_api, _dt, entities) {
        // entities should be injected
        void entities;
      },
    });

    expect(MovementSystem.query).toEqual([Position, Velocity]);
    expect(typeof MovementSystem.onUpdate).toBe('function');
  });

  it('preserves query descriptor on factory form', () => {
    const FilterSystem = defineSystem('FilterSystem', () => ({
      query: { all: [Position], none: [Frozen] } as SystemQuery,
      onUpdate(_api, _dt, _entities) {},
    }));

    const instance = FilterSystem();
    expect(instance.query).toEqual({ all: [Position], none: [Frozen] });
  });

  it('systems without query have undefined query field', () => {
    const SimpleSystem = defineSystem({
      name: 'SimpleSystem',
      onUpdate() {},
    });

    expect(SimpleSystem.query).toBeUndefined();
  });
});
