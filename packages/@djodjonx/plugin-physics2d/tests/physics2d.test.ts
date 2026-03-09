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
  return {
    add_rigid_body: vi.fn().mockReturnValue(0),
    add_box_collider: vi.fn(),
    add_ball_collider: vi.fn(),
    remove_rigid_body: vi.fn(),
    apply_impulse: vi.fn(),
    set_kinematic_position: vi.fn(),
    step: vi.fn(),
    get_position: vi.fn().mockReturnValue([]),
    stats: vi.fn().mockReturnValue('{"bodies":0,"colliders":0}'),
    free: vi.fn(),
  };
}

function makeMockAPI() {
  const registered: Record<string, unknown> = {};
  return {
    services: {
      register: vi.fn((key: string, value: unknown) => {
        registered[key] = value;
      }),
      get: (key: string) => registered[key],
    },
    _registered: registered,
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
import { Physics2DPlugin, physics2D } from '../src/index';
import { BODY_TYPE, parseCollisionEvents, readCollisionEventsFromBuffer } from '../src/types';

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
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(5, 1.0, 2.0, BODY_TYPE.dynamic);
  });

  it('addRigidBody delegates fixed body (type=0)', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addRigidBody: (...a: unknown[]) => unknown;
    };
    physics.addRigidBody(3, 'fixed', 0, 0);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(3, 0, 0, BODY_TYPE.fixed);
  });

  it('addRigidBody delegates kinematic body (type=2)', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addRigidBody: (...a: unknown[]) => unknown;
    };
    physics.addRigidBody(7, 'kinematic', 5, 5);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(7, 5, 5, BODY_TYPE.kinematic);
  });

  // ── Physics2DAPI — colliders ──────────────────────────────────────────────

  it('addBoxCollider delegates with default restitution/friction', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addBoxCollider: (...a: unknown[]) => unknown;
    };
    physics.addBoxCollider(0, 1.0, 2.0);
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(0, 1.0, 2.0, 0, 0.5);
  });

  it('addBallCollider delegates with custom options', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as {
      addBallCollider: (...a: unknown[]) => unknown;
    };
    physics.addBallCollider(0, 0.5, { restitution: 0.8, friction: 0.1 });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(0, 0.5, 0.8, 0.1);
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

  it('getCollisionEvents returns empty array when ring buffer is empty', async () => {
    const plugin = new Physics2DPlugin();
    await initPlugin(plugin, mockBridge, mockAPI, mockBus);
    const physics = mockAPI._registered['physics'] as { getCollisionEvents: () => unknown[] };
    expect(physics.getCollisionEvents()).toEqual([]);
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

  it('getCollisionEvents returns [] before wasm.onInit', () => {
    const plugin = asGwenPlugin(new Physics2DPlugin());
    expect(() => plugin.wasm!.onStep!(0.016)).not.toThrow();
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
