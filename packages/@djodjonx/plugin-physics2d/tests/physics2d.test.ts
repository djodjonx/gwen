/**
 * Tests for @djodjonx/gwen-plugin-physics2d — Physics2DPlugin
 *
 * Strategy: mock the WASM module entirely so tests run in Node.js
 * without a browser or real .wasm file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { GwenPlugin } from '@djodjonx/gwen-kit';

// ─── Helpers & mocks ─────────────────────────────────────────────────────────

function makeMockWasmPlugin() {
  const sensorCounts = new Map<string, number>();

  return {
    add_rigid_body: vi.fn().mockReturnValue(0),
    add_box_collider: vi.fn(),
    add_ball_collider: vi.fn(),
    remove_rigid_body: vi.fn(),
    load_tilemap_chunk_body: vi.fn().mockReturnValue(777),
    unload_tilemap_chunk_body: vi.fn(),
    apply_impulse: vi.fn(),
    set_linear_velocity: vi.fn(),
    set_kinematic_position: vi.fn(),
    set_event_coalescing: vi.fn(),
    set_quality_preset: vi.fn(),
    set_global_ccd_enabled: vi.fn(),
    consume_event_metrics: vi.fn().mockReturnValue([1, 0, 0, 1]),
    get_linear_velocity: vi.fn().mockReturnValue([]),
    get_sensor_state: vi.fn((entityIndex: number, sensorId: number) => {
      const key = `${entityIndex}:${sensorId}`;
      const count = sensorCounts.get(key) ?? 0;
      return [count, count > 0 ? 1 : 0];
    }),
    update_sensor_state: vi.fn((entityIndex: number, sensorId: number, started: number) => {
      const key = `${entityIndex}:${sensorId}`;
      const current = sensorCounts.get(key) ?? 0;
      const next = started === 1 ? current + 1 : Math.max(0, current - 1);
      sensorCounts.set(key, next);
    }),
    step: vi.fn(),
    get_position: vi.fn().mockReturnValue([]),
    stats: vi.fn().mockReturnValue('{"bodies":0,"colliders":0}'),
    bridge_schema_version: vi.fn().mockReturnValue(PHYSICS2D_BRIDGE_SCHEMA_VERSION),
    free: vi.fn(),
  };
}

function makeMockAPI(positionOverride?: { x: number; y: number }) {
  const registered: Record<string, unknown> = {};
  const hookHandlers: Record<string, ((...args: any[]) => void)[]> = {};
  return {
    services: {
      register: vi.fn((key: string, value: unknown) => {
        registered[key] = value;
      }),
      get: (key: string) => registered[key],
    },
    hooks: {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hookHandlers[name] = hookHandlers[name] ?? [];
        hookHandlers[name].push(handler);
      }),
      callHook: vi.fn(async (_name: string, ..._args: any[]) => undefined),
      // Helper pour déclencher un hook depuis les tests
      _trigger: async (name: string, ...args: any[]) => {
        for (const h of hookHandlers[name] ?? []) await h(...args);
      },
    },
    getComponent: vi.fn((_id: any, _schema: any) => positionOverride ?? { x: 100, y: 200 }),
    getEntityGeneration: vi.fn((_slot: number) => 0),
    _registered: registered,
    _hookHandlers: hookHandlers,
  };
}

function makeMockBridge() {
  return { isActive: vi.fn().mockReturnValue(true) };
}

function makeMockBus(transformBuf?: ArrayBuffer, eventsBuf?: ArrayBuffer) {
  const tb = transformBuf ?? new ArrayBuffer(10_000 * 20);
  const eb = eventsBuf ?? new ArrayBuffer(8 + 256 * 11);
  return {
    get: vi.fn((pluginId: string, channelName: string) => {
      if (pluginId === 'physics2d' && channelName === 'transform') return { buffer: tb };
      if (pluginId === 'physics2d' && channelName === 'events') return { buffer: eb };
      return undefined;
    }),
    _transformBuf: tb,
    _eventsBuf: eb,
  };
}

function makeConstructibleCtorMock<T extends object>(value: T) {
  // Vitest 4 requires constructor-style mocks when code uses `new`.
  return vi.fn(function MockCtor(this: Record<string, unknown>) {
    Object.assign(this, value);
    return value;
  });
}

// ── Mock loadWasmPlugin ───────────────────────────────────────────────────────

vi.mock('@djodjonx/gwen-engine-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@djodjonx/gwen-engine-core')>();
  return { ...original, loadWasmPlugin: vi.fn() };
});

// @djodjonx/gwen-kit re-exports loadWasmPlugin from @djodjonx/gwen-engine-core — mock it too
vi.mock('@djodjonx/gwen-kit', async (importOriginal) => {
  const original = await importOriginal<typeof import('@djodjonx/gwen-kit')>();
  return { ...original, loadWasmPlugin: vi.fn() };
});

import { loadWasmPlugin } from '@djodjonx/gwen-kit';
import { createEntityId } from '@djodjonx/gwen-engine-core';
import { Physics2DPlugin, physics2D } from '../src';
import {
  BODY_TYPE,
  parseCollisionEvents,
  readCollisionEventsFromBuffer,
  PHYSICS2D_BRIDGE_SCHEMA_VERSION,
} from '../src/types';

// ── Helpers: access wasm context & lifecycle via GwenPlugin interface ──────────

/** Cast instance to GwenPlugin to access wasm sub-object. */
function asGwenPlugin(p: InstanceType<typeof Physics2DPlugin>): GwenPlugin {
  return p as unknown as GwenPlugin;
}

async function initPlugin(
  plugin: InstanceType<typeof Physics2DPlugin>,
  mockBridge: ReturnType<typeof makeMockBridge>,
  mockAPI: ReturnType<typeof makeMockAPI>,
  mockBus: ReturnType<typeof makeMockBus> | undefined,
) {
  const gp = asGwenPlugin(plugin);
  await gp.wasm!.onInit(mockBridge as never, null, mockAPI as never, (mockBus ?? {}) as never);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Physics2DPlugin', () => {
  let mockWasmPlugin: ReturnType<typeof makeMockWasmPlugin>;
  let mockAPI: ReturnType<typeof makeMockAPI>;
  let mockBridge: ReturnType<typeof makeMockBridge>;
  let mockBus: ReturnType<typeof makeMockBus>;

  beforeEach(() => {
    mockWasmPlugin = makeMockWasmPlugin();
    mockAPI = makeMockAPI();
    mockBridge = makeMockBridge();
    mockBus = makeMockBus();

    (loadWasmPlugin as Mock).mockResolvedValue({
      Physics2DPlugin: makeConstructibleCtorMock(mockWasmPlugin),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Identity ──────────────────────────────────────────────────────────────

  it('has correct name', () => {
    const plugin = new Physics2DPlugin();
    expect(plugin.name).toBe('Physics2D');
  });

  it('has wasm.id = "physics2d"', () => {
    const plugin = asGwenPlugin(new Physics2DPlugin());
    expect(plugin.wasm?.id).toBe('physics2d');
  });

  it('has wasm.sharedMemoryBytes = 0 (uses Plugin Data Bus)', () => {
    const plugin = asGwenPlugin(new Physics2DPlugin());
    expect(plugin.wasm?.sharedMemoryBytes).toBe(0);
  });

  it('declares transform and events channels', () => {
    const plugin = asGwenPlugin(new Physics2DPlugin());
    expect(plugin.wasm?.channels).toHaveLength(2);
    expect(plugin.wasm?.channels![0].name).toBe('transform');
    expect(plugin.wasm?.channels![1].name).toBe('events');
  });

  it('has a provides.physics key', () => {
    const plugin = new Physics2DPlugin();
    expect(plugin.provides).toHaveProperty('physics');
  });

  // ── physics2D() helper ────────────────────────────────────────────────────

  it('physics2D() returns a Physics2DPlugin instance', () => {
    expect(physics2D()).toBeInstanceOf(Physics2DPlugin);
  });

  // ── wasm.onInit ───────────────────────────────────────────────────────────

  it('wasm.onInit loads the WASM module', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    expect(loadWasmPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ jsUrl: '/wasm/gwen_physics2d.js' }),
    );
  });

  it('wasm.onInit constructs WasmPhysics2DPlugin with correct gravity and Bus buffers', async () => {
    const plugin = new Physics2DPlugin({ gravity: -20, gravityX: 1 });
    const WasmCtor = makeConstructibleCtorMock(mockWasmPlugin);
    (loadWasmPlugin as Mock).mockResolvedValue({ Physics2DPlugin: WasmCtor });

    await initPlugin(plugin, mockBridge, mockAPI, mockBus);

    expect(WasmCtor).toHaveBeenCalledWith(
      1,
      -20,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      10_000,
    );
  });

  it('wasm.onInit uses Bus buffers when bus is provided', async () => {
    const tb = new ArrayBuffer(500 * 20);
    const eb = new ArrayBuffer(8 + 256 * 11);
    const bus = makeMockBus(tb, eb);
    const WasmCtor = makeConstructibleCtorMock(mockWasmPlugin);
    (loadWasmPlugin as Mock).mockResolvedValue({ Physics2DPlugin: WasmCtor });

    const plugin = new Physics2DPlugin({ maxEntities: 500 });
    await initPlugin(plugin, mockBridge, mockAPI, bus);

    const [, , transformArg, eventsArg] = WasmCtor.mock.calls[0] as unknown as [
      unknown,
      unknown,
      Uint8Array,
      Uint8Array,
      unknown,
    ];
    expect(transformArg.buffer).toBe(tb);
    expect(eventsArg.buffer).toBe(eb);
  });

  it('wasm.onInit registers the physics service', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    expect(mockAPI.services.register).toHaveBeenCalledWith('physics', expect.any(Object));
    expect(mockAPI._registered['physics']).toBeDefined();
    expect(mockWasmPlugin.set_event_coalescing).toHaveBeenCalledWith(1);
    expect(mockWasmPlugin.set_quality_preset).toHaveBeenCalledWith(1);
    expect(mockWasmPlugin.set_global_ccd_enabled).toHaveBeenCalledWith(0);
  });

  it('wasm.onInit active le CCD global pour qualityPreset=high', async () => {
    const plugin = new Physics2DPlugin({ qualityPreset: 'high' });
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    expect(mockWasmPlugin.set_global_ccd_enabled).toHaveBeenCalledWith(1);
  });

  it('wasm.onInit respecte le override ccdEnabled explicite', async () => {
    const plugin = new Physics2DPlugin({ qualityPreset: 'high', ccdEnabled: false });
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    expect(mockWasmPlugin.set_global_ccd_enabled).toHaveBeenCalledWith(0);
  });

  it('wasm.onInit rejects a bridge version mismatch with an actionable error', async () => {
    const plugin = new Physics2DPlugin();
    mockWasmPlugin.bridge_schema_version.mockReturnValue(PHYSICS2D_BRIDGE_SCHEMA_VERSION + 1);

    await expect(initPlugin(plugin, mockBridge, mockAPI, mockBus)).rejects.toThrow(
      /Bridge schema mismatch/,
    );
  });

  // ── wasm.onStep ───────────────────────────────────────────────────────────

  it('wasm.onStep calls wasm.step with deltaTime', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    asGwenPlugin(plugin).wasm!.onStep!(0.016);
    expect(mockWasmPlugin.step).toHaveBeenCalledWith(0.016);
  });

  it('wasm.onStep is a no-op before wasm.onInit', () => {
    const plugin = asGwenPlugin(new Physics2DPlugin());
    expect(() => plugin.wasm!.onStep!(0.016)).not.toThrow();
  });

  // ── onDestroy ─────────────────────────────────────────────────────────────

  it('onDestroy calls wasm.free()', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    plugin.onDestroy!();
    expect(mockWasmPlugin.free).toHaveBeenCalled();
  });

  it('onDestroy is safe to call before wasm.onInit', () => {
    const plugin = new Physics2DPlugin();
    expect(() => plugin.onDestroy!()).not.toThrow();
  });

  // ── Physics2DAPI — addRigidBody ───────────────────────────────────────────

  it('addRigidBody delegates to wasm with encoded bodyType (dynamic=1)', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addRigidBody: (...a: unknown[]) => unknown;
    };
    physics.addRigidBody(5, 'dynamic', 1.0, 2.0);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      5,
      1.0,
      2.0,
      BODY_TYPE.dynamic,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
    );
  });

  it('addRigidBody delegates fixed body (type=0)', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addRigidBody: (...a: unknown[]) => unknown;
    };
    physics.addRigidBody(3, 'fixed', 0, 0);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      3,
      0,
      0,
      BODY_TYPE.fixed,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
    );
  });

  it('addRigidBody delegates kinematic body (type=2)', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addRigidBody: (...a: unknown[]) => unknown;
    };
    physics.addRigidBody(7, 'kinematic', 5, 5);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      7,
      5,
      5,
      BODY_TYPE.kinematic,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
    );
  });

  // ── Physics2DAPI — colliders ──────────────────────────────────────────────

  it('addBoxCollider delegates with default restitution/friction', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addBoxCollider: (...a: unknown[]) => unknown;
    };
    physics.addBoxCollider(0, 1.0, 2.0);
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      0,
      1.0,
      2.0,
      0,
      0.5,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('addBallCollider delegates with custom options', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addBallCollider: (...a: unknown[]) => unknown;
    };
    physics.addBallCollider(0, 0.5, { restitution: 0.8, friction: 0.1 });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      0,
      0.5,
      0.8,
      0.1,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('addBoxCollider forwards offset options to wasm when provided', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addBoxCollider: (...a: unknown[]) => unknown;
    };

    physics.addBoxCollider(15, 0.28, 0.28, {
      isSensor: true,
      offsetY: 0.34,
      colliderId: 0xf007,
    });

    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      15,
      0.28,
      0.28,
      0,
      0.5,
      1,
      1.0,
      0xffffffff,
      0xffffffff,
      0xf007,
      undefined,
      0.34,
    );
  });

  it('addBoxCollider keeps colliderId path when no offset is provided', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addBoxCollider: (...a: unknown[]) => unknown;
    };

    physics.addBoxCollider(15, 0.28, 0.28, {
      isSensor: true,
      colliderId: 0xf007,
    });

    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      15,
      0.28,
      0.28,
      0,
      0.5,
      1,
      1.0,
      0xffffffff,
      0xffffffff,
      0xf007,
    );
  });

  it('does not emit debug logs when debug option is disabled', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const plugin = new Physics2DPlugin({ debug: false });
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);

    const physics = mockAPI._registered['physics'] as {
      addRigidBody: (...a: unknown[]) => unknown;
    };
    physics.addRigidBody(1, 'dynamic', 0, 0);

    const hasPhysicsDebugLog = logSpy.mock.calls.some((call) =>
      String(call[0]).includes('[Physics2D]'),
    );
    expect(hasPhysicsDebugLog).toBe(false);
    logSpy.mockRestore();
  });

  it('emits strategic debug logs when debug option is enabled', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const plugin = new Physics2DPlugin({ debug: true });
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);

    const physics = mockAPI._registered['physics'] as {
      addRigidBody: (...a: unknown[]) => unknown;
    };
    physics.addRigidBody(1, 'dynamic', 0, 0);

    const hasPhysicsDebugLog = logSpy.mock.calls.some((call) =>
      String(call[0]).includes('[Physics2D]'),
    );
    expect(hasPhysicsDebugLog).toBe(true);
    logSpy.mockRestore();
  });

  // ── Physics2DAPI — removeBody & applyImpulse ──────────────────────────────

  it('removeBody delegates to wasm', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as { removeBody: (...a: unknown[]) => unknown };
    physics.removeBody(42);
    expect(mockWasmPlugin.remove_rigid_body).toHaveBeenCalledWith(42);
  });

  it('applyImpulse delegates with correct args', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      applyImpulse: (...a: unknown[]) => unknown;
    };
    physics.applyImpulse(10, 5.0, -3.0);
    expect(mockWasmPlugin.apply_impulse).toHaveBeenCalledWith(10, 5.0, -3.0);
  });

  // ── Physics2DAPI — getCollisionEvents ─────────────────────────────────────

  it('getCollisionEventsBatch returns an empty batch when ring buffer is empty', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      getCollisionEventsBatch: () => {
        count: number;
        droppedSinceLastRead: number;
        events: unknown[];
      };
    };
    expect(physics.getCollisionEventsBatch()).toEqual(
      expect.objectContaining({ count: 0, droppedSinceLastRead: 0, events: [] }),
    );
  });

  it('getCollisionEvents reads events from binary ring buffer', async () => {
    const eb = mockBus._eventsBuf;
    const view = new DataView(eb);
    view.setUint32(0, 2, true);
    view.setUint32(4, 0, true);
    view.setUint16(8, 0, true);
    view.setUint32(8 + 2, 1, true);
    view.setUint32(8 + 6, 2, true);
    view.setUint8(8 + 10, 1);
    view.setUint16(8 + 11, 0, true);
    view.setUint32(8 + 11 + 2, 3, true);
    view.setUint32(8 + 11 + 6, 4, true);
    view.setUint8(8 + 11 + 10, 0);

    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as { getCollisionEvents: () => unknown[] };
    const events = physics.getCollisionEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ slotA: 1, slotB: 2, started: true });
    expect(events[1]).toEqual({ slotA: 3, slotB: 4, started: false });
  });

  it('getCollisionEventsBatch reuses the same decoded batch object within a frame', async () => {
    const eb = mockBus._eventsBuf;
    const view = new DataView(eb);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, 11, true);
    view.setUint32(8 + 6, 22, true);
    view.setUint8(8 + 10, 1);

    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      getCollisionEventsBatch: (...args: unknown[]) => {
        events: unknown[];
        count: number;
      };
    };

    const first = physics.getCollisionEventsBatch();
    const second = physics.getCollisionEventsBatch();
    expect(second).toBe(first);
    expect(second.events).toBe(first.events);
  });

  it('getCollisionEventsBatch supports a max option without re-draining the buffer', async () => {
    const eb = mockBus._eventsBuf;
    const view = new DataView(eb);
    view.setUint32(0, 2, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, 1, true);
    view.setUint32(8 + 6, 2, true);
    view.setUint8(8 + 10, 1);
    view.setUint32(8 + 11 + 2, 3, true);
    view.setUint32(8 + 11 + 6, 4, true);
    view.setUint8(8 + 11 + 10, 0);

    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      getCollisionEventsBatch: (opts?: { max?: number }) => {
        count: number;
        events: unknown[];
      };
    };

    expect(physics.getCollisionEventsBatch({ max: 1 }).count).toBe(1);
    expect(physics.getCollisionEventsBatch({ max: 1 }).events).toHaveLength(1);
    expect(physics.getCollisionEventsBatch().count).toBe(2);
    expect(physics.getCollisionEventsBatch().events).toHaveLength(2);
  });

  // ── Physics2DAPI — getPosition ────────────────────────────────────────────

  it('getPosition returns null for unknown entity (empty array)', async () => {
    mockWasmPlugin.get_position.mockReturnValue([]);
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as { getPosition: (...a: unknown[]) => unknown };
    expect(physics.getPosition(999)).toBeNull();
  });

  it('getPosition returns { x, y, rotation } when found', async () => {
    mockWasmPlugin.get_position.mockReturnValue([3.0, 7.5, 1.57]);
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as { getPosition: (...a: unknown[]) => unknown };
    expect(physics.getPosition(0)).toEqual({ x: 3.0, y: 7.5, rotation: 1.57 });
  });
});

// ─── readCollisionEventsFromBuffer ────────────────────────────────────────────

describe('readCollisionEventsFromBuffer', () => {
  it('buffer vide → []', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    expect(readCollisionEventsFromBuffer(buf)).toEqual([]);
  });

  it('1 event écrit manuellement → lu correctement', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, 5, true);
    view.setUint32(8 + 6, 3, true);
    view.setUint8(8 + 10, 1);
    const events = readCollisionEventsFromBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ slotA: 5, slotB: 3, started: true });
  });

  it('avance read_head après lecture', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    readCollisionEventsFromBuffer(buf);
    expect(view.getUint32(4, true)).toBe(1);
  });

  it('appel double → 2e appel retourne []', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, 5, true);
    view.setUint32(8 + 6, 3, true);
    view.setUint8(8 + 10, 1);
    readCollisionEventsFromBuffer(buf);
    expect(readCollisionEventsFromBuffer(buf)).toEqual([]);
  });

  it('write_head wrap-around', () => {
    const buf = new ArrayBuffer(8 + 2 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, 42, true);
    view.setUint32(8 + 6, 7, true);
    view.setUint8(8 + 10, 0);
    const events = readCollisionEventsFromBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ slotA: 42, slotB: 7, started: false });
  });
});

// ─── parseCollisionEvents (deprecated) ───────────────────────────────────────

describe('parseCollisionEvents', () => {
  it('parses empty array', () => {
    expect(parseCollisionEvents('[]')).toEqual([]);
  });
  it('parses started=true event', () => {
    expect(parseCollisionEvents('[{"a":1,"b":2,"started":true}]')[0]).toEqual({
      slotA: 1,
      slotB: 2,
      started: true,
    });
  });
  it('parses started=false event', () => {
    expect(parseCollisionEvents('[{"a":5,"b":6,"started":false}]')[0].started).toBe(false);
  });
  it('parses multiple events', () => {
    expect(
      parseCollisionEvents('[{"a":0,"b":1,"started":true},{"a":2,"b":3,"started":false}]'),
    ).toHaveLength(2);
  });
});

// ─── BODY_TYPE constant ───────────────────────────────────────────────────────

describe('BODY_TYPE', () => {
  it('fixed = 0', () => expect(BODY_TYPE.fixed).toBe(0));
  it('dynamic = 1', () => expect(BODY_TYPE.dynamic).toBe(1));
  it('kinematic = 2', () => expect(BODY_TYPE.kinematic).toBe(2));
});

// ─── prefab:instantiate extensions ───────────────────────────────────────────

describe('Physics2DPlugin — prefab:instantiate hook', () => {
  let mockWasmPlugin: ReturnType<typeof makeMockWasmPlugin>;
  let mockBridge: ReturnType<typeof makeMockBridge>;
  let mockBus: ReturnType<typeof makeMockBus>;

  // entityId dont le slot index = 1 (generation = 0)
  const entityId = createEntityId(1, 0);

  beforeEach(() => {
    mockWasmPlugin = makeMockWasmPlugin();
    mockBridge = makeMockBridge();
    mockBus = makeMockBus();
    mockWasmPlugin.add_rigid_body.mockReturnValue(42); // handle fictif

    (loadWasmPlugin as Mock).mockResolvedValue({
      Physics2DPlugin: makeConstructibleCtorMock(mockWasmPlugin),
    });
  });

  afterEach(() => vi.clearAllMocks());

  async function boot(positionOverride?: { x: number; y: number }) {
    const plugin = new Physics2DPlugin();
    const api = makeMockAPI(positionOverride);
    await initPlugin(plugin, mockBridge, api, mockBus);
    return { api };
  }

  it('ne fait rien si extensions.physics est absent', async () => {
    const { api } = await boot();

    await api.hooks._trigger('prefab:instantiate', entityId, {});

    expect(mockWasmPlugin.add_rigid_body).not.toHaveBeenCalled();
    expect(mockWasmPlugin.add_ball_collider).not.toHaveBeenCalled();
    expect(mockWasmPlugin.add_box_collider).not.toHaveBeenCalled();
  });

  it('ne fait rien si extensions est vide', async () => {
    const { api } = await boot();

    await api.hooks._trigger('prefab:instantiate', entityId, undefined);

    expect(mockWasmPlugin.add_rigid_body).not.toHaveBeenCalled();
  });

  it('crée un ball collider si radius est fourni', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'kinematic', radius: 14 },
    });

    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledTimes(1);
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledTimes(1);
    expect(mockWasmPlugin.add_box_collider).not.toHaveBeenCalled();
    // radius converti : 14 / 50 = 0.28, defaults: restitution=0, friction=0, isSensor=0, density=1
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      42,
      14 / 50,
      0,
      0,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('crée un box collider si hw + hh sont fournis', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', hw: 20, hh: 10 },
    });

    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledTimes(1);
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledTimes(1);
    expect(mockWasmPlugin.add_ball_collider).not.toHaveBeenCalled();
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      42,
      20 / 50,
      10 / 50,
      0,
      0,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('convertit la position ECS (pixels → mètres) dans addRigidBody', async () => {
    const { api } = await boot({ x: 100, y: 200 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'kinematic', radius: 5 },
    });

    // La signature WASM réelle est add_rigid_body(entityIndex, x, y, bodyType, mass, gravityScale, linearDamping, angularDamping, vx, vy)
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      1,
      100 / 50,
      200 / 50,
      BODY_TYPE.kinematic,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
    );
  });

  it('utilise restitution et friction si fournis', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', radius: 8, restitution: 0.5, friction: 0.3 },
    });

    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      42,
      8 / 50,
      0.5,
      0.3,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('utilise restitution=0 et friction=0 par défaut', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'kinematic', radius: 6 },
    });

    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      42,
      6 / 50,
      0,
      0,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('ne crée pas de collider si ni radius ni hw/hh ne sont fournis', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'kinematic' },
    });

    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledTimes(1); // le body est créé
    expect(mockWasmPlugin.add_ball_collider).not.toHaveBeenCalled();
    expect(mockWasmPlugin.add_box_collider).not.toHaveBeenCalled();
  });

  it('le hook est bien enregistré via api.hooks.hook', async () => {
    const { api } = await boot();
    expect(api.hooks.hook).toHaveBeenCalledWith('prefab:instantiate', expect.any(Function));
  });

  it('mass et gravityScale sont transmis à add_rigid_body', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', radius: 10, mass: 5.0, gravityScale: 0.5 },
    });
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      1,
      0,
      0,
      BODY_TYPE.dynamic,
      5.0,
      0.5,
      0.0,
      0.0,
      0.0,
      0.0,
    );
  });

  it('ccdEnabled per-body override est transmis à add_rigid_body', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', radius: 10, ccdEnabled: true },
    });
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      1,
      0,
      0,
      BODY_TYPE.dynamic,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1,
      undefined,
    );
  });

  it('additionalSolverIterations est transmis à add_rigid_body', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', radius: 10, additionalSolverIterations: 6 },
    });
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      1,
      0,
      0,
      BODY_TYPE.dynamic,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      undefined,
      6,
    );
  });

  it('linearDamping et angularDamping sont transmis', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', radius: 10, linearDamping: 0.3, angularDamping: 0.1 },
    });
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      1,
      0,
      0,
      BODY_TYPE.dynamic,
      1.0,
      1.0,
      0.3,
      0.1,
      0.0,
      0.0,
    );
  });

  it('initialVelocity est convertie pixels→mètres', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', radius: 10, initialVelocity: { vx: 100, vy: -200 } },
    });
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      1,
      0,
      0,
      BODY_TYPE.dynamic,
      1.0,
      1.0,
      0.0,
      0.0,
      2.0,
      -4.0,
    );
  });

  it('isSensor=true est transmis au collider (1)', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'kinematic', radius: 8, isSensor: true },
    });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      42,
      8 / 50,
      0,
      0,
      1,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('isSensor absent → 0 par défaut', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'kinematic', radius: 8 },
    });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      42,
      8 / 50,
      0,
      0,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('density est transmise au collider box', async () => {
    const { api } = await boot({ x: 0, y: 0 });
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: { bodyType: 'dynamic', hw: 10, hh: 5, density: 2.5 },
    });
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      42,
      10 / 50,
      5 / 50,
      0,
      0,
      0,
      2.5,
      0xffffffff,
      0xffffffff,
    );
  });

  it('crée des colliders vNext depuis colliders[]', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: {
        bodyType: 'dynamic',
        colliders: [
          { shape: 'box', hw: 20, hh: 10, friction: 0.3 },
          { shape: 'ball', radius: 8, isSensor: true },
        ],
      },
    });

    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      42,
      20 / 50,
      10 / 50,
      0,
      0.3,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
      0,
    );
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      42,
      8 / 50,
      0,
      0,
      1,
      1.0,
      0xffffffff,
      0xffffffff,
      1,
    );
  });

  it('utilise bodyType=dynamic par défaut sur le schema vNext', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: {
        colliders: [{ shape: 'ball', radius: 6 }],
      },
    });

    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(
      1,
      0,
      0,
      BODY_TYPE.dynamic,
      1.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
    );
  });

  it('material preset `ice` est resolu pour le schema vNext', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: {
        colliders: [{ shape: 'ball', radius: 8, material: 'ice' }],
      },
    });

    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      42,
      8 / 50,
      0,
      0.02,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
      0,
    );
  });

  it('material custom object est resolu et les overrides explicites restent prioritaires', async () => {
    const { api } = await boot({ x: 0, y: 0 });

    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: {
        colliders: [
          {
            shape: 'box',
            hw: 10,
            hh: 5,
            material: { friction: 0.9, restitution: 0.1, density: 2.0 },
            friction: 0.7,
          },
        ],
      },
    });

    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      42,
      10 / 50,
      5 / 50,
      0.1,
      0.7,
      0,
      2.0,
      0xffffffff,
      0xffffffff,
      0,
    );
  });
});

// ─── Physics2DPlugin — onUpdate policy ───────────────────────────────────────

describe('Physics2DPlugin — onUpdate policy', () => {
  let mockWasmPlugin: ReturnType<typeof makeMockWasmPlugin>;
  let mockBridge: ReturnType<typeof makeMockBridge>;
  let mockBus: ReturnType<typeof makeMockBus>;

  beforeEach(() => {
    mockWasmPlugin = makeMockWasmPlugin();
    mockBridge = makeMockBridge();
    mockBus = makeMockBus();

    (loadWasmPlugin as Mock).mockResolvedValue({
      Physics2DPlugin: makeConstructibleCtorMock(mockWasmPlugin),
    });
  });

  afterEach(() => vi.clearAllMocks());

  function seedSingleCollisionEvent(eventsBuf: ArrayBuffer, slotA = 1, slotB = 2) {
    const view = new DataView(eventsBuf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, slotA, true);
    view.setUint32(8 + 6, slotB, true);
    view.setUint8(8 + 10, 1);
  }

  function seedSingleCollisionEventV2(
    eventsBuf: ArrayBuffer,
    slotA: number,
    slotB: number,
    aColliderId: number,
    bColliderId: number,
  ) {
    const view = new DataView(eventsBuf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    // Event payload (stride 19): [type:2][slotA:4][slotB:4][aColliderId:4][bColliderId:4][started:1]
    view.setUint32(8 + 2, slotA, true);
    view.setUint32(8 + 6, slotB, true);
    view.setUint32(8 + 10, aColliderId, true);
    view.setUint32(8 + 14, bColliderId, true);
    view.setUint8(8 + 18, 1);
  }

  it('en mode pull sans callback opt-in, n emet pas le batch hook', async () => {
    const plugin = new Physics2DPlugin({ eventMode: 'pull' });
    const api = makeMockAPI();
    seedSingleCollisionEvent(mockBus._eventsBuf, 3, 4);

    await initPlugin(plugin, mockBridge, api, mockBus);
    plugin.onUpdate!(api as never, 0.016);

    expect(api.hooks.callHook).not.toHaveBeenCalledWith(
      'physics:collision:batch',
      expect.anything(),
    );
  });

  it('dispatch le hook enrichi en mode hybrid', async () => {
    const plugin = new Physics2DPlugin({ eventMode: 'hybrid' });
    const api = makeMockAPI();
    seedSingleCollisionEvent(mockBus._eventsBuf, 7, 8);
    mockWasmPlugin.consume_event_metrics.mockReturnValue([33, 1, 2, 1]);

    await initPlugin(plugin, mockBridge, api, mockBus);
    plugin.onUpdate!(api as never, 0.016);

    expect(api.hooks.callHook).toHaveBeenCalledWith(
      'physics:collision:batch',
      expect.objectContaining({
        frame: 33,
        droppedCritical: 1,
        droppedNonCritical: 2,
        droppedSinceLastRead: 3,
        count: 1,
      }),
    );
    expect(api.hooks.callHook).toHaveBeenCalledWith(
      'physics:collision',
      expect.arrayContaining([expect.objectContaining({ slotA: 7, slotB: 8, started: true })]),
    );
  });

  it('updates sensor state in pull mode using collider ids (no callback required)', async () => {
    const plugin = new Physics2DPlugin({ eventMode: 'pull' });
    const api = makeMockAPI();
    const eventsBufV2 = new ArrayBuffer(8 + 256 * 19);
    const busV2 = makeMockBus(undefined, eventsBufV2);

    seedSingleCollisionEventV2(eventsBufV2, 7, 8, 0xf007, 0xbeef);

    await initPlugin(plugin, mockBridge, api, busV2);
    plugin.onUpdate!(api as never, 0.016);

    const physics = api._registered['physics'] as {
      getSensorState: (entityIndex: number, sensorId: number) => { isActive: boolean };
    };

    expect(physics.getSensorState(7, 0xf007).isActive).toBe(true);
    expect(physics.getSensorState(8, 0xbeef).isActive).toBe(true);
    // pull mode without callbacks should not emit collision hooks, only internal sensor updates
    expect(api.hooks.callHook).not.toHaveBeenCalledWith(
      'physics:collision:batch',
      expect.anything(),
    );
  });

  it('updates known sensor id for legacy payloads without collider ids', async () => {
    const plugin = new Physics2DPlugin({ eventMode: 'pull' });
    const api = makeMockAPI({ x: 0, y: 0 });
    const entityId = createEntityId(7, 0);

    // Legacy stride payload: no collider ids available
    seedSingleCollisionEvent(mockBus._eventsBuf, 7, 8);

    await initPlugin(plugin, mockBridge, api, mockBus);
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: {
        colliders: [
          { shape: 'box', hw: 10, hh: 10 },
          { shape: 'box', hw: 8, hh: 2, isSensor: true, colliderId: 0xf007 },
        ],
      },
    });

    plugin.onUpdate!(api as never, 0.016);

    const physics = api._registered['physics'] as {
      getSensorState: (entityIndex: number, sensorId: number) => { isActive: boolean };
    };

    expect(physics.getSensorState(7, 0xf007).isActive).toBe(true);
  });

  it('dispatch aussi quand un callback prefab onCollision est enregistre', async () => {
    const plugin = new Physics2DPlugin({ eventMode: 'pull' });
    const api = makeMockAPI({ x: 0, y: 0 });
    const entityId = createEntityId(7, 0);
    const onCollision = vi.fn();
    seedSingleCollisionEvent(mockBus._eventsBuf, 7, 8);

    await initPlugin(plugin, mockBridge, api, mockBus);
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: {
        colliders: [{ shape: 'ball', radius: 6 }],
        onCollision,
      },
    });

    plugin.onUpdate!(api as never, 0.016);

    expect(api.hooks.callHook).toHaveBeenCalledWith(
      'physics:collision',
      expect.arrayContaining([expect.objectContaining({ slotA: 7, slotB: 8, started: true })]),
    );
    expect(onCollision).toHaveBeenCalled();
  });
});

// ─── LayerRegistry / layers & masks (Sprint 3) ───────────────────────────────

describe('LayerRegistry — layer resolution', () => {
  // We test LayerRegistry indirectly via the plugin's addBoxCollider /
  // addBallCollider bridge calls, which now forward membership + filter.

  let mockWasmPlugin: ReturnType<typeof makeMockWasmPlugin>;
  let mockBridge: ReturnType<typeof makeMockBridge>;
  let mockBus: ReturnType<typeof makeMockBus>;

  beforeEach(() => {
    mockWasmPlugin = makeMockWasmPlugin();
    mockBridge = makeMockBridge();
    mockBus = makeMockBus();
    (loadWasmPlugin as Mock).mockResolvedValue({
      Physics2DPlugin: makeConstructibleCtorMock(mockWasmPlugin),
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('no layers config → membership and filter default to 0xFFFFFFFF', async () => {
    const freshAPI = makeMockAPI();
    await initPlugin(new Physics2DPlugin(), mockBridge, freshAPI, mockBus);
    const freshPhysics = freshAPI._registered['physics'] as {
      addBoxCollider: (...a: unknown[]) => void;
    };
    freshPhysics.addBoxCollider(0, 1.0, 1.0);
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      0,
      1.0,
      1.0,
      0,
      0.5,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
    );
  });

  it('named layers resolve to correct bitmask', async () => {
    const plugin = new Physics2DPlugin({
      layers: { default: 0, player: 1, enemy: 2, ground: 3 },
    });
    const api = makeMockAPI();
    await initPlugin(plugin, mockBridge, api, mockBus);
    const physics = api._registered['physics'] as {
      addBallCollider: (...a: unknown[]) => void;
    };
    physics.addBallCollider(0, 0.5, {
      membershipLayers: ['player'], // bit 1 → 0b10 = 2
      filterLayers: ['enemy', 'ground'], // bit 2 + bit 3 → 0b1100 = 12
    });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      0,
      0.5,
      0,
      0.5,
      0,
      1.0,
      2, // membership: 1 << 1
      12, // filter: (1<<2)|(1<<3)
    );
  });

  it('raw number bitmask is passed through as-is', async () => {
    const plugin = new Physics2DPlugin({ layers: { default: 0 } });
    const api = makeMockAPI();
    await initPlugin(plugin, mockBridge, api, mockBus);
    const physics = api._registered['physics'] as {
      addBoxCollider: (...a: unknown[]) => void;
    };
    physics.addBoxCollider(0, 1.0, 1.0, {
      membershipLayers: 0b0101,
      filterLayers: 0b1010,
    });
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      0,
      1.0,
      1.0,
      0,
      0.5,
      0,
      1.0,
      5,
      10,
    );
  });

  it('unknown layer name throws a descriptive error', async () => {
    const plugin = new Physics2DPlugin({
      layers: { player: 0, ground: 1 },
    });
    const api = makeMockAPI();
    await initPlugin(plugin, mockBridge, api, mockBus);
    const physics = api._registered['physics'] as {
      addBallCollider: (...a: unknown[]) => void;
    };
    expect(() => physics.addBallCollider(0, 0.5, { membershipLayers: ['unknown_layer'] })).toThrow(
      /Unknown layer "unknown_layer"/,
    );
    expect(() => physics.addBallCollider(0, 0.5, { membershipLayers: ['unknown_layer'] })).toThrow(
      /player/,
    ); // hint lists known layers
  });

  it('throws on layer bit index out of range', () => {
    expect(() => new Physics2DPlugin({ layers: { bad: 32 } })).toThrow(/invalid bit index/);
    expect(() => new Physics2DPlugin({ layers: { bad: -1 } })).toThrow(/invalid bit index/);
  });

  it('throws when more than 32 layers are declared', () => {
    const tooMany: Record<string, number> = {};
    for (let i = 0; i < 33; i++) tooMany[`l${i}`] = i % 32; // reuse bits to avoid range error
    // The registry checks count, not unique bits
    expect(() => new Physics2DPlugin({ layers: tooMany })).toThrow(/Too many layers/);
  });

  it('colliders[] with membershipLayers resolves correctly via prefab instantiation', async () => {
    const plugin = new Physics2DPlugin({
      layers: { player: 1, ground: 3 },
    });
    const api = makeMockAPI({ x: 0, y: 0 });
    await initPlugin(plugin, mockBridge, api, mockBus);
    const entityId = createEntityId(1, 0);
    await api.hooks._trigger('prefab:instantiate', entityId, {
      physics: {
        colliders: [
          {
            shape: 'ball',
            radius: 8,
            membershipLayers: ['player'], // bit 1 → 2
            filterLayers: ['ground'], // bit 3 → 8
          },
        ],
      },
    });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      expect.any(Number),
      8 / 50,
      0,
      0,
      0,
      1.0,
      2, // membership
      8, // filter
      0,
    );
  });
});

// ─── Physics2DPlugin — tilemap chunk runtime ─────────────────────────────────

describe('Physics2DPlugin — tilemap chunk runtime', () => {
  let mockWasmPlugin: ReturnType<typeof makeMockWasmPlugin>;
  let mockBridge: ReturnType<typeof makeMockBridge>;
  let mockBus: ReturnType<typeof makeMockBus>;

  beforeEach(() => {
    mockWasmPlugin = makeMockWasmPlugin();
    mockBridge = makeMockBridge();
    mockBus = makeMockBus();
    (loadWasmPlugin as Mock).mockResolvedValue({
      Physics2DPlugin: makeConstructibleCtorMock(mockWasmPlugin),
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('loadTilemapPhysicsChunk charge un body fixe de chunk puis ses colliders avec offsets', async () => {
    const plugin = new Physics2DPlugin();
    const api = makeMockAPI();
    await initPlugin(plugin, mockBridge, api, mockBus);
    const physics = api._registered['physics'] as import('../src').Physics2DAPI;

    physics.loadTilemapPhysicsChunk(
      {
        key: '0:0',
        chunkX: 0,
        chunkY: 0,
        checksum: 'abc123',
        rects: [{ x: 0, y: 0, w: 2, h: 1 }],
        colliders: [{ shape: 'box', hw: 16, hh: 8, offsetX: 16, offsetY: 8 }],
      },
      3,
      4,
    );

    expect(mockWasmPlugin.load_tilemap_chunk_body).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      3,
      4,
    );
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(
      777,
      16 / 50,
      8 / 50,
      0,
      0.5,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
      0,
      16 / 50,
      8 / 50,
    );
  });

  it('patchTilemapPhysicsChunk unload puis recharge le chunk', async () => {
    const plugin = new Physics2DPlugin();
    const api = makeMockAPI();
    await initPlugin(plugin, mockBridge, api, mockBus);
    const physics = api._registered['physics'] as import('../src').Physics2DAPI;
    const chunk = {
      key: '1:2',
      chunkX: 1,
      chunkY: 2,
      checksum: 'v1',
      rects: [],
      colliders: [{ shape: 'ball' as const, radius: 10 }],
    };

    physics.loadTilemapPhysicsChunk(chunk, 0, 0);
    physics.patchTilemapPhysicsChunk({ ...chunk, checksum: 'v2' }, 1, 2);
    physics.unloadTilemapPhysicsChunk(chunk.key);

    expect(mockWasmPlugin.unload_tilemap_chunk_body).toHaveBeenCalled();
    expect(mockWasmPlugin.load_tilemap_chunk_body).toHaveBeenCalledTimes(2);
  });

  it('loadTilemapPhysicsChunk applique aussi les presets materiaux', async () => {
    const plugin = new Physics2DPlugin();
    const api = makeMockAPI();
    await initPlugin(plugin, mockBridge, api, mockBus);
    const physics = api._registered['physics'] as import('../src').Physics2DAPI;

    physics.loadTilemapPhysicsChunk(
      {
        key: '2:0',
        chunkX: 2,
        chunkY: 0,
        checksum: 'rubber',
        rects: [],
        colliders: [{ shape: 'ball', radius: 12, material: 'rubber' }],
      },
      0,
      0,
    );

    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(
      777,
      12 / 50,
      0.85,
      1.2,
      0,
      1.0,
      0xffffffff,
      0xffffffff,
      0,
    );
  });
});
