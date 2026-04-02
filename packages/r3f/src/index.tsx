import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useFrame } from '@react-three/fiber';

export type GwenEntityIdLike = string | number | bigint;
export type GwenComponentTypeLike = string | { name?: string };

export interface TransformLike {
  position?: {
    set?: (x: number, y: number, z: number) => void;
    x?: number;
    y?: number;
    z?: number;
  };
  quaternion?: {
    set?: (x: number, y: number, z: number, w: number) => void;
    x?: number;
    y?: number;
    z?: number;
    w?: number;
  };
  scale?: { set?: (x: number, y: number, z: number) => void; x?: number; y?: number; z?: number };
}

interface Transform3DDataLike {
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
  scale?: { x: number; y: number; z: number };
}

export interface GwenEngineLike {
  getConfig(): { loop?: 'internal' | 'external' };
  getAPI(): {
    query(componentTypes: GwenComponentTypeLike[]): GwenEntityIdLike[];
    component: {
      get(entityId: GwenEntityIdLike, componentType: GwenComponentTypeLike): unknown;
    };
    services: {
      get(name: string): unknown;
    };
    hooks: {
      hook(name: string, callback: (...args: unknown[]) => unknown): () => void;
    };
  };
  advance?(deltaSeconds: number): Promise<void> | void;
}

interface GwenContextValue {
  engine: GwenEngineLike;
}

const GwenContext = createContext<GwenContextValue | null>(null);

export interface GwenProviderProps {
  engine: GwenEngineLike;
  children: ReactNode;
}

/** Provide a GWEN Engine instance to R3F components. */
export function GwenProvider({ engine, children }: GwenProviderProps): React.JSX.Element {
  const value = useMemo<GwenContextValue>(() => ({ engine }), [engine]);
  return <GwenContext.Provider value={value}>{children}</GwenContext.Provider>;
}

/** Read the current GWEN Engine from context. */
export function useGwenEngine(): GwenEngineLike {
  const ctx = useContext(GwenContext);
  if (!ctx) {
    throw new Error('[gwen-adapter-r3f] useGwenEngine() must be used inside <GwenProvider>.');
  }
  return ctx.engine;
}

/**
 * R3F loop bridge.
 *
 * Calls `engine.advance(deltaSeconds)` once per R3F frame.
 * Designed for `loop: 'external'` engine mode.
 */
export function GwenLoop(): null {
  const engine = useGwenEngine();

  useFrame((_, delta) => {
    const cfg = engine.getConfig();
    if (cfg.loop !== 'external') {
      return;
    }
    const ret = engine.advance?.(delta);
    if (ret && typeof (ret as Promise<void>).then === 'function') {
      void (ret as Promise<void>).catch((err: unknown) => {
        console.error('[gwen-adapter-r3f] engine.advance() failed:', err);
      });
    }
  });

  return null;
}

/**
 * Resolve a service registered in GWEN ServiceLocator.
 *
 * This is the **React-context** variant of the core `useService()` composable.
 * It retrieves the service from the engine exposed via {@link GwenProvider}.
 * Prefer this hook inside R3F components; use core's `useService()` inside
 * {@link defineSystem} callbacks.
 *
 * @typeParam T - Expected service API type
 * @param name - Service name as registered in the engine
 * @returns The service instance cast to `T`
 *
 * @example
 * ```tsx
 * const physics = useGwenService<Physics2DAPI>('physics2d')
 * ```
 */
export function useGwenService<T = unknown>(name: string): T {
  const engine = useGwenEngine();
  return engine.getAPI().services.get(name) as T;
}

/**
 * Read physics body state from a service (default: `physics3d`) and keep it synced each frame.
 *
 * Uses {@link useGwenService} internally to resolve the physics service by name.
 *
 * @typeParam T - Physics body state shape returned by the service
 * @param entityId - The entity whose body state to read
 * @param serviceName - Service key to resolve (defaults to `'physics3d'`)
 * @returns Current body state, or `undefined` if not yet available
 */
export function usePhysicsBodyState<T = unknown>(
  entityId: GwenEntityIdLike,
  serviceName = 'physics3d',
): T | undefined {
  const physics = useGwenService<{ getBodyState?: (id: GwenEntityIdLike) => unknown }>(serviceName);
  const [state, setState] = useState<T | undefined>(() =>
    physics?.getBodyState ? (physics.getBodyState(entityId) as T | undefined) : undefined,
  );

  useFrame(() => {
    const next = physics?.getBodyState
      ? (physics.getBodyState(entityId) as T | undefined)
      : undefined;
    if (!deepEqual(state, next)) {
      setState(next);
    }
  });

  return state;
}

/**
 * Subscribe to a GWEN hook from React.
 *
 * Automatically unsubscribes on unmount and on dependency changes.
 */
export function useEvent(
  hookName: string,
  handler: (...args: unknown[]) => void,
  deps: React.DependencyList = [],
): void {
  const engine = useGwenEngine();
  const api = engine.getAPI();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const off = api.hooks.hook(hookName, (...args: unknown[]) => {
      handlerRef.current(...args);
    });
    return () => {
      off();
    };
  }, [api, hookName, ...deps]);
}

/**
 * Query entities matching all component types.
 *
 * Subscribes to core mutation hooks and refreshes the query result on changes.
 */
export function useQuery<TId extends GwenEntityIdLike = GwenEntityIdLike>(
  componentTypes: GwenComponentTypeLike[],
): TId[] {
  const engine = useGwenEngine();
  const api = engine.getAPI();
  const key = componentTypes
    .map((c) => (typeof c === 'string' ? c : (c.name ?? 'component')))
    .join('|');

  const runQuery = (): TId[] => api.query(componentTypes) as TId[];
  const [ids, setIds] = useState<TId[]>(() => runQuery());

  useEffect(() => {
    setIds(runQuery());

    const refresh = () => setIds(runQuery());
    const unsubs = [
      api.hooks.hook('component:add', refresh),
      api.hooks.hook('component:removed', refresh),
      api.hooks.hook('entity:destroyed', refresh),
      api.hooks.hook('scene:loaded', refresh),
    ];

    return () => {
      for (const off of unsubs) off();
    };
  }, [api, key]);

  return ids;
}

/**
 * Read a component value and keep it in sync once per frame.
 */
export function useComponentValue<T = unknown>(
  entityId: GwenEntityIdLike,
  componentType: GwenComponentTypeLike,
): T | undefined {
  const engine = useGwenEngine();
  const api = engine.getAPI();
  const [value, setValue] = useState<T | undefined>(
    () => api.component.get(entityId, componentType) as T | undefined,
  );

  useFrame(() => {
    const next = api.component.get(entityId, componentType) as T | undefined;
    if (!deepEqual(value, next)) {
      setValue(next);
    }
  });

  return value;
}

/**
 * Apply a Transform3D-like component to a target object each frame.
 */
export function useEntityTransform(
  entityId: GwenEntityIdLike,
  targetRef: MutableRefObject<TransformLike | null>,
  transformComponent: GwenComponentTypeLike = 'Transform3D',
): void {
  const engine = useGwenEngine();
  const api = engine.getAPI();

  useFrame(() => {
    const data = api.component.get(entityId, transformComponent) as Transform3DDataLike | undefined;
    const target = targetRef.current;
    if (!data || !target) return;

    if (data.position && target.position) {
      if (typeof target.position.set === 'function') {
        target.position.set(data.position.x, data.position.y, data.position.z);
      } else {
        target.position.x = data.position.x;
        target.position.y = data.position.y;
        target.position.z = data.position.z;
      }
    }

    if (data.rotation && target.quaternion) {
      if (typeof target.quaternion.set === 'function') {
        target.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
      } else {
        target.quaternion.x = data.rotation.x;
        target.quaternion.y = data.rotation.y;
        target.quaternion.z = data.rotation.z;
        target.quaternion.w = data.rotation.w;
      }
    }

    if (data.scale && target.scale) {
      if (typeof target.scale.set === 'function') {
        target.scale.set(data.scale.x, data.scale.y, data.scale.z);
      } else {
        target.scale.x = data.scale.x;
        target.scale.y = data.scale.y;
        target.scale.z = data.scale.z;
      }
    }
  });
}

/**
 * Structural equality up to `maxDepth` levels of plain-object nesting.
 *
 * `maxDepth = 1` → shallow (top-level `Object.is` on values).
 * `maxDepth = 2` → deep enough for Physics3DBodyState (`{ position: {x,y,z}, … }`).
 *
 * Arrays and class instances are compared by identity (Object.is), which keeps
 * the implementation predictable for the engine data shapes we care about.
 */
function deepEqual(a: unknown, b: unknown, maxDepth = 2): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return false; // arrays by identity only
  if (maxDepth <= 0) return false;

  const aa = a as Record<string, unknown>;
  const bb = b as Record<string, unknown>;
  const ka = Object.keys(aa);
  const kb = Object.keys(bb);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!deepEqual(aa[k], bb[k], maxDepth - 1)) return false;
  }
  return true;
}
