// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { type EntityId, createEntityId } from '@gwenjs/core';
import type { GwenEngine } from '@gwenjs/core';
import type { ComponentDef } from '@gwenjs/core';
import type { ComponentDefinition, ComponentSchema, InferComponent } from '@gwenjs/core';
import { GwenProvider } from '../src/GwenProvider';
import { useGwenQuery, useGwenComponent } from '../src/hooks';

vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable entity IDs for test assertions. */
const E1 = createEntityId(1, 0);
const E2 = createEntityId(2, 0);
const E3 = createEntityId(3, 0);

type HookListenerMap = Map<string, Set<(...args: unknown[]) => void>>;

/**
 * Builds a minimal GwenEngine mock with controllable ECS state.
 *
 * Exposes `_setEntities`, `_setComponent`, and `_trigger` helpers so tests can
 * manipulate state without reaching into engine internals.
 */
function makeEngineMock() {
  const listeners: HookListenerMap = new Map();
  let queryEntities: EntityId[] = [];
  const componentStore = new Map<string, unknown>();

  /** Record a listener; return an unsubscribe function. */
  function hook(event: string, cb: (...args: unknown[]) => void): () => void {
    const set = listeners.get(event) ?? new Set();
    set.add(cb);
    listeners.set(event, set);
    return () => {
      set.delete(cb);
    };
  }

  /** Remove a specific listener. */
  function removeHook(event: string, cb: (...args: unknown[]) => void): void {
    listeners.get(event)?.delete(cb);
  }

  const engine = {
    hooks: { hook, removeHook },

    createLiveQuery(_components: ComponentDef[]) {
      const snapshot = [...queryEntities];
      return {
        [Symbol.iterator]() {
          let i = 0;
          return {
            next(): IteratorResult<{ id: EntityId; get: () => undefined }> {
              if (i >= snapshot.length) return { done: true, value: undefined as never };
              const id = snapshot[i++]!;
              return { done: false, value: { id, get: () => undefined } };
            },
          };
        },
      };
    },

    getComponent<D extends ComponentDefinition<ComponentSchema>>(
      id: EntityId,
      def: D,
    ): InferComponent<D> | undefined {
      return componentStore.get(`${String(id)}:${def.name}`) as InferComponent<D> | undefined;
    },

    // ─── Test control methods ──────────────────────────────────────────────

    _setEntities(ids: EntityId[]): void {
      queryEntities = ids;
    },

    _setComponent(id: EntityId, defName: string, value: unknown): void {
      componentStore.set(`${String(id)}:${defName}`, value);
    },

    _trigger(event: string, ...args: unknown[]): void {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
  } as unknown as GwenEngine & {
    _setEntities(ids: EntityId[]): void;
    _setComponent(id: EntityId, defName: string, value: unknown): void;
    _trigger(event: string, ...args: unknown[]): void;
  };

  return engine;
}

/** Minimal ComponentDef stub (name-only — sufficient for ECS mock). */
function makeComponentDef(name: string): ComponentDef {
  return { name, schema: {} } as unknown as ComponentDef;
}

const Position = makeComponentDef('Position');
const Velocity = makeComponentDef('Velocity');
const Health = makeComponentDef('Health');

/** React wrapper that provides the mock engine via context. */
function makeWrapper(engine: GwenEngine) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GwenProvider engine={engine}>{children}</GwenProvider>;
  };
}

// ─── useGwenQuery tests ───────────────────────────────────────────────────────

describe('useGwenQuery', () => {
  let engine: ReturnType<typeof makeEngineMock>;
  let wrapper: ReturnType<typeof makeWrapper>;

  beforeEach(() => {
    engine = makeEngineMock();
    wrapper = makeWrapper(engine as unknown as GwenEngine);
  });

  it('returns correct entity IDs for a matching query', () => {
    engine._setEntities([E1, E2]);

    const { result } = renderHook(() => useGwenQuery([Position]), { wrapper });

    expect(result.current).toEqual([E1, E2]);
  });

  it('returns an empty array when no entities match the query', () => {
    engine._setEntities([]);

    const { result } = renderHook(() => useGwenQuery([Position, Velocity]), { wrapper });

    expect(result.current).toHaveLength(0);
  });

  it('returns a stable array reference when the entity set has not changed', () => {
    engine._setEntities([E1, E2]);

    const { result, rerender } = renderHook(() => useGwenQuery([Position]), { wrapper });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('triggers a re-render and returns updated IDs when an entity is spawned', () => {
    engine._setEntities([E1]);

    const { result } = renderHook(() => useGwenQuery([Position]), { wrapper });

    expect(result.current).toEqual([E1]);

    act(() => {
      engine._setEntities([E1, E2, E3]);
      engine._trigger('entity:spawn', E2);
    });

    expect(result.current).toEqual([E1, E2, E3]);
  });

  it('triggers a re-render and removes the entity when one is destroyed', () => {
    engine._setEntities([E1, E2]);

    const { result } = renderHook(() => useGwenQuery([Position]), { wrapper });

    act(() => {
      engine._setEntities([E2]);
      engine._trigger('entity:destroy', E1);
    });

    expect(result.current).toEqual([E2]);
  });
});

// ─── useGwenComponent tests ───────────────────────────────────────────────────

describe('useGwenComponent', () => {
  let engine: ReturnType<typeof makeEngineMock>;
  let wrapper: ReturnType<typeof makeWrapper>;

  beforeEach(() => {
    engine = makeEngineMock();
    wrapper = makeWrapper(engine as unknown as GwenEngine);
  });

  it('returns the component data for an entity that has the component', () => {
    const data = { current: 100, max: 100 };
    engine._setComponent(E1, 'Health', data);

    const { result } = renderHook(() => useGwenComponent(E1, Health), { wrapper });

    expect(result.current).toEqual({ current: 100, max: 100 });
  });

  it('returns undefined for an entity that does not have the component', () => {
    // No component set for E1.
    const { result } = renderHook(() => useGwenComponent(E1, Health), { wrapper });

    expect(result.current).toBeUndefined();
  });

  it('triggers a re-render with updated data after engine:afterTick fires', () => {
    const initialData = { current: 80, max: 100 };
    engine._setComponent(E1, 'Health', initialData);

    const { result } = renderHook(() => useGwenComponent(E1, Health), { wrapper });

    expect(result.current).toEqual({ current: 80, max: 100 });

    const updatedData = { current: 50, max: 100 };
    act(() => {
      engine._setComponent(E1, 'Health', updatedData);
      engine._trigger('engine:afterTick', 16);
    });

    expect(result.current).toEqual({ current: 50, max: 100 });
  });

  it('returns undefined after the entity is destroyed', () => {
    const data = { current: 100, max: 100 };
    engine._setComponent(E1, 'Health', data);

    const { result } = renderHook(() => useGwenComponent(E1, Health), { wrapper });

    expect(result.current).toEqual({ current: 100, max: 100 });

    act(() => {
      // Destroying the entity clears its components.
      engine._setComponent(E1, 'Health', undefined);
      engine._trigger('entity:destroy', E1);
    });

    expect(result.current).toBeUndefined();
  });

  it('does not re-render when the same data reference is returned', () => {
    const data = { current: 100, max: 100 };
    engine._setComponent(E1, 'Health', data);

    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return useGwenComponent(E1, Health);
      },
      { wrapper },
    );

    const rendersBefore = renderCount;

    // Tick fires but component store still returns the same reference.
    act(() => {
      engine._trigger('engine:afterTick', 16);
    });

    // The component value reference is the same — React bails out.
    expect(renderCount).toBe(rendersBefore);
    expect(result.current).toEqual({ current: 100, max: 100 });
  });
});
