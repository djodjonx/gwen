import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const frameCallbacks: Array<(state: unknown, delta: number) => void> = [];

vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: unknown, delta: number) => void) => {
    frameCallbacks.push(cb);
  },
}));

import {
  GwenProvider,
  GwenLoop,
  useGwenEngine,
  useService,
  usePhysicsBodyState,
  useEvent,
  useQuery,
  useComponentValue,
  useEntityTransform,
  type GwenEngineLike,
} from '../src/index';

interface EngineMockControls {
  setQuery(ids: Array<string | number | bigint>): void;
  setComponent(entityId: string | number | bigint, componentType: string, value: unknown): void;
  emitHook(name: string, ...args: unknown[]): void;
}

function makeEngineMock(
  overrides?: Partial<{ loop: 'internal' | 'external' }>,
): GwenEngineLike & EngineMockControls {
  const hookMap = new Map<string, Set<(...args: unknown[]) => unknown>>();
  const components = new Map<string, unknown>();
  let queryResult: Array<string | number | bigint> = [1n, 2n];

  const key = (entityId: string | number | bigint, componentType: string) =>
    `${String(entityId)}::${componentType}`;

  const servicesGet = vi.fn((name: string) => {
    if (name === 'physics3d') return { name: 'physics-service' };
    return null;
  });

  const query = vi.fn(() => queryResult);
  const componentGet = vi.fn(
    (entityId: string | number | bigint, componentType: string | { name?: string }) => {
      const name =
        typeof componentType === 'string' ? componentType : (componentType.name ?? 'component');
      return components.get(key(entityId, name));
    },
  );
  const hook = vi.fn((name: string, callback: (...args: unknown[]) => unknown) => {
    const set = hookMap.get(name) ?? new Set<(...args: unknown[]) => unknown>();
    set.add(callback);
    hookMap.set(name, set);
    return () => {
      set.delete(callback);
    };
  });

  const api = {
    query,
    component: {
      get: componentGet,
    },
    services: {
      get: servicesGet,
    },
    hooks: {
      hook,
    },
  } as GwenEngineLike['getAPI'] extends () => infer T ? T : never;

  return {
    getConfig: vi.fn(() => ({ loop: overrides?.loop ?? 'external' })),
    getAPI: vi.fn(() => api),
    advance: vi.fn(() => Promise.resolve()),
    setQuery(ids: Array<string | number | bigint>) {
      queryResult = ids;
    },
    setComponent(entityId: string | number | bigint, componentType: string, value: unknown) {
      components.set(key(entityId, componentType), value);
    },
    emitHook(name: string, ...args: unknown[]) {
      const listeners = hookMap.get(name);
      if (!listeners) return;
      for (const cb of listeners) cb(...args);
    },
  } as GwenEngineLike & EngineMockControls;
}

describe('gwen-adapter-r3f', () => {
  beforeEach(() => {
    frameCallbacks.length = 0;
  });

  it('GwenProvider + useGwenEngine returns provided engine instance', async () => {
    const engine = makeEngineMock();
    let got: GwenEngineLike | null = null;

    function Probe() {
      got = useGwenEngine();
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    expect(got).toBe(engine);

    await act(async () => {
      root.unmount();
    });
  });

  it('useService resolves service from engine API', async () => {
    const engine = makeEngineMock();
    let service: unknown = null;

    function Probe() {
      service = useService('physics3d');
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    expect(service).toEqual({ name: 'physics-service' });

    await act(async () => {
      root.unmount();
    });
  });

  it('usePhysicsBodyState reads and updates body state from physics service', async () => {
    const engine = makeEngineMock();
    let current = { position: { x: 0, y: 0, z: 0 } };
    (engine.getAPI() as any).services.get = vi.fn((name: string) => {
      if (name === 'physics3d') {
        return {
          getBodyState: () => current,
        };
      }
      return null;
    });

    let bodyState: { position: { x: number; y: number; z: number } } | undefined;

    function Probe() {
      bodyState = usePhysicsBodyState<{ position: { x: number; y: number; z: number } }>(1n);
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    expect(bodyState?.position.x).toBe(0);

    await act(async () => {
      current = { position: { x: 3, y: 0, z: 0 } };
      for (const cb of frameCallbacks) cb({}, 1 / 60);
    });

    expect(bodyState?.position.x).toBe(3);

    await act(async () => {
      root.unmount();
    });
  });

  it('GwenLoop calls engine.advance(delta) in external loop mode', async () => {
    const engine = makeEngineMock({ loop: 'external' });

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <GwenLoop />
        </GwenProvider>,
      );
    });

    expect(frameCallbacks.length).toBeGreaterThan(0);

    await act(async () => {
      for (const cb of frameCallbacks) cb({}, 1 / 60);
    });

    expect(engine.advance).toHaveBeenCalledWith(1 / 60);

    await act(async () => {
      root.unmount();
    });
  });

  it('GwenLoop does not call engine.advance in internal loop mode', async () => {
    const engine = makeEngineMock({ loop: 'internal' });

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <GwenLoop />
        </GwenProvider>,
      );
    });

    await act(async () => {
      for (const cb of frameCallbacks) cb({}, 0.02);
    });

    expect(engine.advance).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it('useQuery refreshes entity ids on hook events', async () => {
    const engine = makeEngineMock();
    let ids: Array<string | number | bigint> = [];

    function Probe() {
      ids = useQuery(['position']);
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    expect(ids).toEqual([1n, 2n]);

    await act(async () => {
      engine.setQuery([2n]);
      engine.emitHook('entity:destroyed', 1n);
    });

    expect(ids).toEqual([2n]);

    await act(async () => {
      root.unmount();
    });
  });

  it('useComponentValue tracks component updates on frame', async () => {
    const engine = makeEngineMock();
    engine.setComponent(1n, 'Health', { hp: 10 });
    let value: { hp: number } | undefined;

    function Probe() {
      value = useComponentValue<{ hp: number }>(1n, 'Health');
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    expect(value).toEqual({ hp: 10 });

    await act(async () => {
      engine.setComponent(1n, 'Health', { hp: 20 });
      for (const cb of frameCallbacks) cb({}, 1 / 60);
    });

    expect(value).toEqual({ hp: 20 });

    await act(async () => {
      root.unmount();
    });
  });

  it('useEntityTransform applies transform data to target ref on frame', async () => {
    const engine = makeEngineMock();
    engine.setComponent(1n, 'Transform3D', {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 2, y: 2, z: 2 },
    });

    const target = {
      position: { set: vi.fn() },
      quaternion: { set: vi.fn() },
      scale: { set: vi.fn() },
    };

    function Probe() {
      const ref = React.useRef(target);
      useEntityTransform(1n, ref);
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    await act(async () => {
      for (const cb of frameCallbacks) cb({}, 1 / 60);
    });

    expect(target.position.set).toHaveBeenCalledWith(1, 2, 3);
    expect(target.quaternion.set).toHaveBeenCalledWith(0, 0, 0, 1);
    expect(target.scale.set).toHaveBeenCalledWith(2, 2, 2);

    await act(async () => {
      root.unmount();
    });
  });

  it('useEvent subscribes to hook and receives emitted payloads', async () => {
    const engine = makeEngineMock();
    const calls: unknown[][] = [];

    function Probe() {
      useEvent('physics:collision', (...args) => {
        calls.push(args);
      });
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    await act(async () => {
      engine.emitHook('physics:collision', { a: 1, b: 2 });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ a: 1, b: 2 });

    await act(async () => {
      root.unmount();
    });
  });

  it('usePhysicsBodyState does not re-render when body state is structurally equal (deep comparison)', async () => {
    const engine = makeEngineMock();
    let renderCount = 0;
    const bodyData = { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    (engine.getAPI() as any).services.get = vi.fn(() => ({
      getBodyState: () => ({
        ...bodyData,
        position: { ...bodyData.position },
        rotation: { ...bodyData.rotation },
      }),
    }));

    let bodyState: typeof bodyData | undefined;

    function Probe() {
      renderCount++;
      bodyState = usePhysicsBodyState<typeof bodyData>(1n);
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    const rendersBefore = renderCount;
    // Fire several frames — each frame returns structurally equal data (but new objects).
    await act(async () => {
      for (const cb of frameCallbacks) cb({}, 1 / 60);
      for (const cb of frameCallbacks) cb({}, 1 / 60);
      for (const cb of frameCallbacks) cb({}, 1 / 60);
    });

    // No extra renders because data is structurally equal
    expect(renderCount).toBe(rendersBefore);
    expect(bodyState?.position.x).toBe(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('useEvent unsubscribes on unmount', async () => {
    const engine = makeEngineMock();
    const handler = vi.fn();

    function Probe() {
      useEvent('entity:create', handler);
      return null;
    }

    const el = document.createElement('div');
    const root = createRoot(el);

    await act(async () => {
      root.render(
        <GwenProvider engine={engine}>
          <Probe />
        </GwenProvider>,
      );
    });

    await act(async () => {
      engine.emitHook('entity:create', 1n);
    });
    expect(handler).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });

    await act(async () => {
      engine.emitHook('entity:create', 2n);
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
