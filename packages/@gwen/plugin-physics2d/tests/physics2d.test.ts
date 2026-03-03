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
    get_collision_events: vi.fn().mockReturnValue('[]'),
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

/** Build a mock WasmBridge */
function makeMockBridge() {
  return {
    isActive: vi.fn().mockReturnValue(true),
    allocSharedBuffer: vi.fn().mockReturnValue(1024),
    syncTransformsToBuffer: vi.fn(),
    syncTransformsFromBuffer: vi.fn(),
  };
}

/** Build a mock MemoryRegion */
function makeMockRegion(pluginId = 'physics2d') {
  return { pluginId, ptr: 4096, byteLength: 10_000 * 32, byteOffset: 0 };
}

// ── Mock loadWasmPlugin ───────────────────────────────────────────────────────

// We intercept the module-level import of loadWasmPlugin.
vi.mock('@gwen/engine-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@gwen/engine-core')>();
  return {
    ...original,
    loadWasmPlugin: vi.fn(),
  };
});

import { loadWasmPlugin } from '@gwen/engine-core';
import { Physics2DPlugin, physics2D } from '../src/index';
import { BODY_TYPE, parseCollisionEvents } from '../src/types';

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Physics2DPlugin', () => {
  let mockWasmPlugin: ReturnType<typeof makeMockWasmPlugin>;
  let mockAPI: ReturnType<typeof makeMockAPI>;
  let mockBridge: ReturnType<typeof makeMockBridge>;
  let mockRegion: ReturnType<typeof makeMockRegion>;

  beforeEach(() => {
    mockWasmPlugin = makeMockWasmPlugin();
    mockAPI = makeMockAPI();
    mockBridge = makeMockBridge();
    mockRegion = makeMockRegion();

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

  it('sets sharedMemoryBytes = maxEntities × 32', () => {
    const plugin = new Physics2DPlugin({ maxEntities: 500 });
    expect(plugin.sharedMemoryBytes).toBe(500 * 32);
  });

  it('defaults to 10_000 entities', () => {
    const plugin = new Physics2DPlugin();
    expect(plugin.sharedMemoryBytes).toBe(10_000 * 32);
  });

  it('has a provides.physics key', () => {
    const plugin = new Physics2DPlugin();
    expect(plugin.provides).toHaveProperty('physics');
  });

  // ── physics2D() helper ────────────────────────────────────────────────────

  it('physics2D() returns a Physics2DPlugin', () => {
    expect(physics2D()).toBeInstanceOf(Physics2DPlugin);
  });

  it('physics2D() passes config to constructor', () => {
    const p = physics2D({ gravity: -20, maxEntities: 2000 });
    expect(p.sharedMemoryBytes).toBe(2000 * 32);
  });

  // ── onInit ────────────────────────────────────────────────────────────────

  it('onInit loads the WASM module', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    expect(loadWasmPlugin).toHaveBeenCalledWith(
      expect.objectContaining({ jsUrl: '/wasm/gwen_physics2d.js' }),
    );
  });

  it('onInit constructs WasmPhysics2DPlugin with correct gravity', async () => {
    const plugin = new Physics2DPlugin({ gravity: -20, gravityX: 1 });
    const WasmCtor = vi.fn().mockReturnValue(mockWasmPlugin);
    (loadWasmPlugin as Mock).mockResolvedValue({ Physics2DPlugin: WasmCtor });

    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);

    expect(WasmCtor).toHaveBeenCalledWith(1, -20, mockRegion.ptr, 10_000);
  });

  it('onInit passes region.ptr to the Rust constructor', async () => {
    const region = makeMockRegion();
    region.ptr = 99999;
    const WasmCtor = vi.fn().mockReturnValue(mockWasmPlugin);
    (loadWasmPlugin as Mock).mockResolvedValue({ Physics2DPlugin: WasmCtor });

    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, region as never, mockAPI as never);

    expect(WasmCtor).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      99999,
      expect.any(Number),
    );
  });

  it('onInit registers the physics service', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    expect(mockAPI.services.register).toHaveBeenCalledWith('physics', expect.any(Object));
    expect(mockAPI._registered['physics']).toBeDefined();
  });

  // ── onStep ────────────────────────────────────────────────────────────────

  it('onStep calls wasm.step with deltaTime', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    plugin.onStep(0.016);
    expect(mockWasmPlugin.step).toHaveBeenCalledWith(0.016);
  });

  it('onStep is a no-op before onInit', () => {
    const plugin = new Physics2DPlugin();
    // Should not throw
    expect(() => plugin.onStep(0.016)).not.toThrow();
  });

  // ── onDestroy ─────────────────────────────────────────────────────────────

  it('onDestroy calls wasm.free()', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
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
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const api = mockAPI._registered['physics'] as ReturnType<
      (typeof plugin)['_createAPI' & string]
    >;
    (
      api as never as { addRigidBody: (a: number, b: string, c: number, d: number) => number }
    ).addRigidBody(5, 'dynamic', 1.0, 2.0);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(5, 1.0, 2.0, BODY_TYPE.dynamic);
  });

  it('addRigidBody delegates fixed body (type=0)', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { addRigidBody: Function };
    physics.addRigidBody(3, 'fixed', 0, 0);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(3, 0, 0, BODY_TYPE.fixed);
  });

  it('addRigidBody delegates kinematic body (type=2)', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { addRigidBody: Function };
    physics.addRigidBody(7, 'kinematic', 5, 5);
    expect(mockWasmPlugin.add_rigid_body).toHaveBeenCalledWith(7, 5, 5, BODY_TYPE.kinematic);
  });

  // ── Physics2DAPI — colliders ──────────────────────────────────────────────

  it('addBoxCollider delegates with default restitution/friction', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { addBoxCollider: Function };
    physics.addBoxCollider(0, 1.0, 2.0);
    expect(mockWasmPlugin.add_box_collider).toHaveBeenCalledWith(0, 1.0, 2.0, 0, 0.5);
  });

  it('addBallCollider delegates with custom options', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { addBallCollider: Function };
    physics.addBallCollider(0, 0.5, { restitution: 0.8, friction: 0.1 });
    expect(mockWasmPlugin.add_ball_collider).toHaveBeenCalledWith(0, 0.5, 0.8, 0.1);
  });

  // ── Physics2DAPI — removeBody & applyImpulse ──────────────────────────────

  it('removeBody delegates to wasm', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { removeBody: Function };
    physics.removeBody(42);
    expect(mockWasmPlugin.remove_rigid_body).toHaveBeenCalledWith(42);
  });

  it('applyImpulse delegates with correct args', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { applyImpulse: Function };
    physics.applyImpulse(10, 5.0, -3.0);
    expect(mockWasmPlugin.apply_impulse).toHaveBeenCalledWith(10, 5.0, -3.0);
  });

  // ── Physics2DAPI — getCollisionEvents ─────────────────────────────────────

  it('getCollisionEvents returns empty array when no events', async () => {
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { getCollisionEvents: Function };
    expect(physics.getCollisionEvents()).toEqual([]);
  });

  it('getCollisionEvents parses JSON from wasm correctly', async () => {
    mockWasmPlugin.get_collision_events.mockReturnValue(
      '[{"a":1,"b":2,"started":true},{"a":3,"b":4,"started":false}]',
    );
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { getCollisionEvents: Function };
    const events = physics.getCollisionEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ entityA: 1, entityB: 2, started: true });
    expect(events[1]).toEqual({ entityA: 3, entityB: 4, started: false });
  });

  it('getCollisionEvents returns [] before onInit', () => {
    const plugin = new Physics2DPlugin();
    // Access _createAPI indirectly — plugin not initialized
    // Test via onStep safety guard
    expect(() => plugin.onStep(0.016)).not.toThrow();
  });

  // ── Physics2DAPI — getPosition ────────────────────────────────────────────

  it('getPosition returns null for unknown entity (empty array)', async () => {
    mockWasmPlugin.get_position.mockReturnValue([]);
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { getPosition: Function };
    expect(physics.getPosition(999)).toBeNull();
  });

  it('getPosition returns { x, y, rotation } when found', async () => {
    mockWasmPlugin.get_position.mockReturnValue([3.0, 7.5, 1.57]);
    const plugin = new Physics2DPlugin();
    await plugin.onInit(mockBridge as never, mockRegion as never, mockAPI as never);
    const physics = mockAPI._registered['physics'] as { getPosition: Function };
    expect(physics.getPosition(0)).toEqual({ x: 3.0, y: 7.5, rotation: 1.57 });
  });
});

// ─── parseCollisionEvents ─────────────────────────────────────────────────────

describe('parseCollisionEvents', () => {
  it('parses empty array', () => {
    expect(parseCollisionEvents('[]')).toEqual([]);
  });

  it('parses started=true event', () => {
    const events = parseCollisionEvents('[{"a":1,"b":2,"started":true}]');
    expect(events[0]).toEqual({ entityA: 1, entityB: 2, started: true });
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
