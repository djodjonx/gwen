/**
 * Tests for Physics3D systems.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const physics3dInit = vi.fn();
const physics3dStep = vi.fn();

const mockBridge = {
  variant: 'physics3d' as const,
  getPhysicsBridge: vi.fn(() => ({
    physics3d_init: physics3dInit,
    physics3d_step: physics3dStep,
    // No physics3d_add_body — local mode
  })),
};

vi.mock('@gwenengine/core', () => ({
  getWasmBridge: () => mockBridge,
  unpackEntityId: (id: bigint) => ({ index: Number(id & 0xffffffffn), generation: 0 }),
  createEntityId: (index: number, gen: number) => BigInt(index) | (BigInt(gen) << 32n),
  defineSystem: vi.fn((_name: string, factory: () => unknown) => factory()),
  definePlugin: vi.fn((factory: () => unknown) => {
    // Simple stub: return a class whose instances have the definition methods
    const def = factory() as Record<string, unknown>;
    return class {
      name = def.name;
      onInit(api: unknown) {
        (def.onInit as (api: unknown) => void)?.(api);
      }
      onBeforeUpdate(api: unknown) {
        (def.onBeforeUpdate as (api: unknown) => void)?.(api);
      }
      onDestroy() {
        (def.onDestroy as () => void)?.();
      }
    };
  }),
}));

import { createPhysicsKinematicSyncSystem, SENSOR_ID_FOOT, SENSOR_ID_HEAD } from '../src/systems';

describe('SENSOR_ID constants', () => {
  it('SENSOR_ID_FOOT is 0xf007', () => {
    expect(SENSOR_ID_FOOT).toBe(0xf007);
  });

  it('SENSOR_ID_HEAD is 0xf008', () => {
    expect(SENSOR_ID_HEAD).toBe(0xf008);
  });
});

describe('createPhysicsKinematicSyncSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makePhysicsMock() {
    return {
      hasBody: vi.fn(() => true),
      getBodyKind: vi.fn(() => 'kinematic'),
      setKinematicPosition: vi.fn(() => true),
    };
  }

  function makeApi(entities: unknown[], physicsMock: ReturnType<typeof makePhysicsMock>) {
    return {
      services: {
        get: vi.fn((name: string) => (name === 'physics3d' ? physicsMock : undefined)),
      },
      hooks: {
        hook: vi.fn(() => vi.fn()),
        callHook: vi.fn(),
      },
      query: vi.fn(() => entities),
      getComponent: vi.fn(),
    } as unknown as any;
  }

  it('factory returns a plugin class with the correct name', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    expect(instance.name).toBe('Physics3DKinematicSyncSystem');
  });

  it('resolves physics3d service on onInit', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    const api = makeApi([], physics);

    instance.onInit(api);

    expect(api.services.get).toHaveBeenCalledWith('physics3d');
  });

  it('syncs kinematic entity positions on onBeforeUpdate', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    const entityId = 1n;
    const api = makeApi([entityId], physics);

    (api.getComponent as ReturnType<typeof vi.fn>).mockReturnValue({ x: 1, y: 2, z: 3 });

    instance.onInit(api);
    instance.onBeforeUpdate(api);

    expect(physics.setKinematicPosition).toHaveBeenCalledWith(
      entityId,
      { x: 1, y: 2, z: 3 },
      undefined,
    );
  });

  it('skips entities without a body', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    physics.hasBody.mockReturnValue(false);
    const api = makeApi([1n], physics);
    (api.getComponent as ReturnType<typeof vi.fn>).mockReturnValue({ x: 0, y: 0, z: 0 });

    instance.onInit(api);
    instance.onBeforeUpdate(api);

    expect(physics.setKinematicPosition).not.toHaveBeenCalled();
  });

  it('skips non-kinematic bodies', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    physics.getBodyKind.mockReturnValue('dynamic');
    const api = makeApi([1n], physics);
    (api.getComponent as ReturnType<typeof vi.fn>).mockReturnValue({ x: 0, y: 0, z: 0 });

    instance.onInit(api);
    instance.onBeforeUpdate(api);

    expect(physics.setKinematicPosition).not.toHaveBeenCalled();
  });

  it('skips entities missing the position component', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    const api = makeApi([1n], physics);
    (api.getComponent as ReturnType<typeof vi.fn>).mockReturnValue(null);

    instance.onInit(api);
    instance.onBeforeUpdate(api);

    expect(physics.setKinematicPosition).not.toHaveBeenCalled();
  });

  it('syncs rotation when rotationComponent is configured', () => {
    const SystemClass = createPhysicsKinematicSyncSystem({
      positionComponent: 'transform3d',
      rotationComponent: 'rotation3d',
    });
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    const api = makeApi([1n], physics);

    (api.getComponent as ReturnType<typeof vi.fn>).mockImplementation(
      (_entityId: unknown, comp: string) => {
        if (comp === 'transform3d') return { x: 0, y: 1, z: 0 };
        if (comp === 'rotation3d') return { x: 0, y: 0.707, z: 0, w: 0.707 };
        return null;
      },
    );

    instance.onInit(api);
    instance.onBeforeUpdate(api);

    expect(physics.setKinematicPosition).toHaveBeenCalledWith(
      1n,
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0.707, z: 0, w: 0.707 },
    );
  });

  it('uses default positionComponent "transform3d"', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    const api = makeApi([1n], physics);
    (api.getComponent as ReturnType<typeof vi.fn>).mockReturnValue({ x: 5, y: 6, z: 7 });

    instance.onInit(api);
    instance.onBeforeUpdate(api);

    expect(api.query).toHaveBeenCalledWith(['transform3d']);
  });

  it('clears physics reference on destroy', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    const api = makeApi([1n], physics);
    (api.getComponent as ReturnType<typeof vi.fn>).mockReturnValue({ x: 0, y: 0, z: 0 });

    instance.onInit(api);
    instance.onDestroy();
    instance.onBeforeUpdate(api);

    // After destroy, physics is null so setKinematicPosition should not be called
    expect(physics.setKinematicPosition).not.toHaveBeenCalled();
  });

  it('is a no-op on onBeforeUpdate before onInit', () => {
    const SystemClass = createPhysicsKinematicSyncSystem();
    const instance = new SystemClass() as any;
    const physics = makePhysicsMock();
    const api = makeApi([1n], physics);

    // Do not call onInit
    instance.onBeforeUpdate(api);
    expect(physics.setKinematicPosition).not.toHaveBeenCalled();
  });
});
