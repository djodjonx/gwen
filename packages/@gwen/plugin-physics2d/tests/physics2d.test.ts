/**
 * Tests for @gwen/plugin-physics2d — Physics2DPlugin
 *
 * Strategy: mock the WASM module entirely so tests run in Node.js
 * without a browser or real .wasm file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// ─── Helpers & mocks ─────────────────────────────────────────────────────────

/** Build a mock WasmPhysics2DPlugin (all methods are vi.fn()) */
function makeMockWasmPlugin() {
  return {
    add_rigid_body: vi.fn().mockReturnValue(0),
    add_box_collider: vi.fn(),
    add_ball_collider: vi.fn(),
    remove_rigid_body: vi.fn(),
    apply_impulse: vi.fn(),
    step: vi.fn(),
    get_position: vi.fn().mockReturnValue([]),
    stats: vi.fn().mockReturnValue('{"bodies":0,"colliders":0}'),
    free: vi.fn(),
  };
}

/** Build a mock EngineAPI */
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

/** Build a minimal mock WasmBridge (no SAB methods needed) */
function makeMockBridge() {
  return {
    isActive: vi.fn().mockReturnValue(true),
  };
}

/** Build a mock PluginDataBus */
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

// ── Mock loadWasmPlugin ───────────────────────────────────────────────────────

vi.mock('@gwen/engine-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@gwen/engine-core')>();
  return {
    ...original,
    loadWasmPlugin: vi.fn(),
  };
});

import { loadWasmPlugin } from '@gwen/engine-core';
import { Physics2DPlugin, physics2D } from '../src/index';
import { BODY_TYPE, parseCollisionEvents, readCollisionEventsFromBuffer } from '../src/types';

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

    // Default: loadWasmPlugin resolves with a module whose constructor returns our mock
    (loadWasmPlugin as Mock).mockResolvedValue({
      Physics2DPlugin: vi.fn().mockReturnValue(mockWasmPlugin),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Constructor & identity ────────────────────────────────────────────────

  it('has correct id and name', () => {
    const plugin = new Physics2DPlugin();
    expect(plugin.id).toBe('physics2d');
    expect(plugin.name).toBe('Physics2D');
  });

  it('has sharedMemoryBytes = 0 (uses Plugin Data Bus)', () => {
    const plugin = new Physics2DPlugin({ maxEntities: 500 });
    expect(plugin.sharedMemoryBytes).toBe(0);
  });

  it('declares transform and events channels', () => {
    const plugin = new Physics2DPlugin();
    expect(plugin.channels).toHaveLength(2);
    expect(plugin.channels![0].name).toBe('transform');
    expect(plugin.channels![1].name).toBe('events');
  });

  it('has a provides.physics key', () => {
    const plugin = new Physics2DPlugin();
    expect(plugin.provides).toHaveProperty('physics');
  });

  // ── physics2D() helper ────────────────────────────────────────────────────

  it('physics2D() returns a Physics2DPlugin', () => {
    expect(physics2D()).toBeInstanceOf(Physics2DPlugin);
  });

  it('physics2D() passes config (maxEntities stored in config)', () => {
    const p = physics2D({ gravity: -20, maxEntities: 2000 });
    expect(p.config.maxEntities).toBe(2000);
    expect(p.config.gravity).toBe(-20);
  });

  // ── onInit ────────────────────────────────────────────────────────────────

  it('onInit loads the WASM module', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    expect(loadWasmPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ jsUrl: '/wasm/gwen_physics2d.js' }),
    );
  });

  it('onInit constructs WasmPhysics2DPlugin with correct gravity and Bus buffers', async () => {
    const plugin = new Physics2DPlugin({ gravity: -20, gravityX: 1 });
    const WasmCtor = vi.fn().mockReturnValue(mockWasmPlugin);
    (loadWasmPlugin as Mock).mockResolvedValue({ Physics2DPlugin: WasmCtor });

    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);

    // Constructor: (gravityX, gravityY, Uint8Array(transformBuf), Uint8Array(eventsBuf), maxEntities)
    expect(WasmCtor).toHaveBeenCalledWith(
      1,
      -20,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      10_000,
    );
  });

  it('onInit uses Bus buffers when bus is provided', async () => {
    const tb = new ArrayBuffer(500 * 20);
    const eb = new ArrayBuffer(8 + 256 * 11);
    const bus = makeMockBus(tb, eb);
    const WasmCtor = vi.fn().mockReturnValue(mockWasmPlugin);
    (loadWasmPlugin as Mock).mockResolvedValue({ Physics2DPlugin: WasmCtor });

    const plugin = new Physics2DPlugin({ maxEntities: 500 });
    await plugin.onInit(mockBridge as never, null, mockAPI as never, bus as never);

    const [, , transformArg, eventsArg] = WasmCtor.mock.calls[0] as [
      unknown,
      unknown,
      Uint8Array,
      Uint8Array,
      unknown,
    ];
    expect(transformArg.buffer).toBe(tb);
    expect(eventsArg.buffer).toBe(eb);
  });

  it('onInit falls back to fresh ArrayBuffer when bus is not provided', async () => {
    const WasmCtor = vi.fn().mockReturnValue(mockWasmPlugin);
    (loadWasmPlugin as Mock).mockResolvedValue({ Physics2DPlugin: WasmCtor });

    const plugin = new Physics2DPlugin({ maxEntities: 100 });
    await plugin.onInit(mockBridge as never, null, mockAPI as never, undefined);

    const [, , transformArg, eventsArg] = WasmCtor.mock.calls[0] as [
      unknown,
      unknown,
      Uint8Array,
      Uint8Array,
      unknown,
    ];
    expect(transformArg).toBeInstanceOf(Uint8Array);
    expect(eventsArg).toBeInstanceOf(Uint8Array);
    expect(transformArg.byteLength).toBe(100 * 20);
  });

  it('onInit registers the physics service', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    expect(mockAPI.services.register).toHaveBeenCalledWith('physics', expect.any(Object));
    expect(mockAPI._registered['physics']).toBeDefined();
  });

  // ── onStep ────────────────────────────────────────────────────────────────

  it('onStep calls wasm.step with deltaTime', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    plugin.onStep(0.016);
    expect(mockWasmPlugin.step).toHaveBeenCalledWith(0.016);
  });

  it('onStep is a no-op before onInit', () => {
    const plugin = new Physics2DPlugin();
    expect(() => plugin.onStep(0.016)).not.toThrow();
  });

  // ── onDestroy ─────────────────────────────────────────────────────────────

  it('onDestroy calls wasm.free()', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    plugin.onDestroy();
    expect(mockWasmPlugin.free).toHaveBeenCalled();
  });

  it('onDestroy is safe to call before onInit', () => {
    const plugin = new Physics2DPlugin();
    expect(() => plugin.onDestroy()).not.toThrow();
  });

  // ── Physics2DAPI — addRigidBody ───────────────────────────────────────────

  it('addRigidBody delegates to wasm with encoded bodyType (dynamic=1)', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { addRigidBody: Function };
    physics.addRigidBody(5, 'dynamic', 1.0, 2.0);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(5, 1.0, 2.0, BODY_TYPE.dynamic);
  });

  it('addRigidBody delegates fixed body (type=0)', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { addRigidBody: Function };
    physics.addRigidBody(3, 'fixed', 0, 0);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(3, 0, 0, BODY_TYPE.fixed);
  });

  it('addRigidBody delegates kinematic body (type=2)', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { addRigidBody: Function };
    physics.addRigidBody(7, 'kinematic', 5, 5);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(7, 5, 5, BODY_TYPE.kinematic);
  });

  // ── Physics2DAPI — colliders ──────────────────────────────────────────────

  it('addBoxCollider delegates with default restitution/friction', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { addBoxCollider: Function };
    physics.addBoxCollider(0, 1.0, 2.0);
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(0, 1.0, 2.0, 0, 0.5);
  });

  it('addBallCollider delegates with custom options', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { addBallCollider: Function };
    physics.addBallCollider(0, 0.5, { restitution: 0.8, friction: 0.1 });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(0, 0.5, 0.8, 0.1);
  });

  // ── Physics2DAPI — removeBody & applyImpulse ──────────────────────────────

  it('removeBody delegates to wasm', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { removeBody: Function };
    physics.removeBody(42);
    expect(mockWasmPlugin.remove_rigid_body).toHaveBeenCalledWith(42);
  });

  it('applyImpulse delegates with correct args', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { applyImpulse: Function };
    physics.applyImpulse(10, 5.0, -3.0);
    expect(mockWasmPlugin.apply_impulse).toHaveBeenCalledWith(10, 5.0, -3.0);
  });

  // ── Physics2DAPI — getCollisionEvents (binary ring buffer) ────────────────

  it('getCollisionEvents returns empty array when ring buffer is empty', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { getCollisionEvents: Function };
    expect(physics.getCollisionEvents()).toEqual([]);
  });

  it('getCollisionEvents reads events from binary ring buffer', async () => {
    // Write 2 events manually into the events buffer before calling the API
    const eb = mockBus._eventsBuf;
    const view = new DataView(eb);
    // Event 1: slotA=1, slotB=2, started=true
    view.setUint32(0, 2, true); // write_head = 2
    view.setUint32(4, 0, true); // read_head  = 0
    // offset = 8 + 0*11 = 8
    view.setUint16(8, 0, true); // type = 0
    view.setUint32(8 + 2, 1, true); // slotA = 1
    view.setUint32(8 + 6, 2, true); // slotB = 2
    view.setUint8(8 + 10, 1); // flags = 1 (started)
    // Event 2: slotA=3, slotB=4, started=false
    view.setUint16(8 + 11, 0, true);
    view.setUint32(8 + 11 + 2, 3, true);
    view.setUint32(8 + 11 + 6, 4, true);
    view.setUint8(8 + 11 + 10, 0);

    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { getCollisionEvents: Function };
    const events = physics.getCollisionEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ slotA: 1, slotB: 2, started: true });
    expect(events[1]).toEqual({ slotA: 3, slotB: 4, started: false });
  });

  it('getCollisionEvents returns [] before onInit', () => {
    const plugin = new Physics2DPlugin();
    expect(() => plugin.onStep(0.016)).not.toThrow();
  });

  // ── Physics2DAPI — getPosition ────────────────────────────────────────────

  it('getPosition returns null for unknown entity (empty array)', async () => {
    mockWasmPlugin.get_position.mockReturnValue([]);
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { getPosition: Function };
    expect(physics.getPosition(999)).toBeNull();
  });

  it('getPosition returns { x, y, rotation } when found', async () => {
    mockWasmPlugin.get_position.mockReturnValue([3.0, 7.5, 1.57]);
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, null, mockAPI as never, mockBus as never);
    const physics = mockAPI._registered['physics'] as { getPosition: Function };
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
    view.setUint32(0, 1, true); // write_head = 1
    view.setUint32(4, 0, true); // read_head  = 0
    view.setUint32(8 + 2, 5, true); // slotA = 5
    view.setUint32(8 + 6, 3, true); // slotB = 3
    view.setUint8(8 + 10, 1); // started = true
    const events = readCollisionEventsFromBuffer(buf);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ slotA: 5, slotB: 3, started: true });
  });

  it('avance read_head après lecture (marque le buffer comme consommé)', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true); // write_head = 1
    view.setUint32(4, 0, true); // read_head  = 0
    readCollisionEventsFromBuffer(buf);
    expect(view.getUint32(4, true)).toBe(1); // read_head = write_head après lecture
  });

  it('appel double → 2e appel retourne []', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, 5, true);
    view.setUint32(8 + 6, 3, true);
    view.setUint8(8 + 10, 1);
    readCollisionEventsFromBuffer(buf); // première lecture
    expect(readCollisionEventsFromBuffer(buf)).toEqual([]); // buffer vide maintenant
  });

  it('write_head wrap-around', () => {
    // capacity = 2 avec 8 + 2*11 = 30 bytes
    const buf = new ArrayBuffer(8 + 2 * 11);
    const view = new DataView(buf);
    // Simuler write_head = 1, read_head = 1 (ring plein → écrit au slot 0 wrappé)
    // Cas plus simple : write_head = 1, read_head = 0 → 1 event au slot 0
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    view.setUint32(8 + 2, 42, true); // slotA = 42
    view.setUint32(8 + 6, 7, true); // slotB = 7
    view.setUint8(8 + 10, 0); // started = false
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
    const events = parseCollisionEvents('[{"a":1,"b":2,"started":true}]');
    expect(events[0]).toEqual({ slotA: 1, slotB: 2, started: true });
  });

  it('parses started=false event', () => {
    const events = parseCollisionEvents('[{"a":5,"b":6,"started":false}]');
    expect(events[0].started).toBe(false);
  });

  it('parses multiple events', () => {
    const json = '[{"a":0,"b":1,"started":true},{"a":2,"b":3,"started":false}]';
    expect(parseCollisionEvents(json)).toHaveLength(2);
  });
});

// ─── BODY_TYPE constant ───────────────────────────────────────────────────────

describe('BODY_TYPE', () => {
  it('fixed = 0', () => expect(BODY_TYPE.fixed).toBe(0));
  it('dynamic = 1', () => expect(BODY_TYPE.dynamic).toBe(1));
  it('kinematic = 2', () => expect(BODY_TYPE.kinematic).toBe(2));
});
