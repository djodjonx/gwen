/**
 * Tests for the Physics3D plugin in 'wasm' backend mode.
 *
 * These tests mock the full WASM bridge surface (including physics3d_add_body and friends)
 * to verify that the plugin delegates all body operations to the WASM layer when available,
 * and does NOT run the local TS simulation in that mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const physics3dInit = vi.fn();
const physics3dStep = vi.fn();
const physics3dAddBody = vi.fn().mockReturnValue(true);
const physics3dRemoveBody = vi.fn().mockReturnValue(true);
const physics3dHasBody = vi.fn().mockReturnValue(false);

// Mutable state store keyed by entityIndex
const wasmBodyState = new Map<number, Float32Array>();
const wasmLinVel = new Map<number, Float32Array>();
const wasmAngVel = new Map<number, Float32Array>();
const wasmKind = new Map<number, number>();

const physics3dGetBodyState = vi.fn((idx: number) => {
  const s = wasmBodyState.get(idx);
  return s ?? new Float32Array(13);
});
const physics3dSetBodyState = vi.fn(
  (
    idx: number,
    px: number,
    py: number,
    pz: number,
    qx: number,
    qy: number,
    qz: number,
    qw: number,
    vx: number,
    vy: number,
    vz: number,
    ax: number,
    ay: number,
    az: number,
  ) => {
    wasmBodyState.set(idx, new Float32Array([px, py, pz, qx, qy, qz, qw, vx, vy, vz, ax, ay, az]));
    wasmLinVel.set(idx, new Float32Array([vx, vy, vz]));
    wasmAngVel.set(idx, new Float32Array([ax, ay, az]));
    return true;
  },
);
const physics3dGetLinearVelocity = vi.fn((idx: number) => {
  return wasmLinVel.get(idx) ?? new Float32Array(3);
});
const physics3dSetLinearVelocity = vi.fn((idx: number, vx: number, vy: number, vz: number) => {
  const v = new Float32Array([vx, vy, vz]);
  wasmLinVel.set(idx, v);
  // Sync into body state
  const s = wasmBodyState.get(idx) ?? new Float32Array(13);
  s[7] = vx;
  s[8] = vy;
  s[9] = vz;
  wasmBodyState.set(idx, s);
  return true;
});
const physics3dGetAngularVelocity = vi.fn((idx: number) => {
  return wasmAngVel.get(idx) ?? new Float32Array(3);
});
const physics3dSetAngularVelocity = vi.fn((idx: number, ax: number, ay: number, az: number) => {
  const v = new Float32Array([ax, ay, az]);
  wasmAngVel.set(idx, v);
  return true;
});
const physics3dApplyImpulse = vi.fn().mockReturnValue(true);
const physics3dGetBodyKind = vi.fn((idx: number) => wasmKind.get(idx) ?? 1);
const physics3dSetBodyKind = vi.fn((idx: number, kind: number) => {
  wasmKind.set(idx, kind);
  return true;
});
const physics3dAddBoxCollider = vi.fn().mockReturnValue(true);
const physics3dAddMeshCollider = vi.fn().mockReturnValue(true);
const physics3dAddConvexCollider = vi.fn().mockReturnValue(true);

const mockBridge = {
  variant: 'physics3d' as const,
  getPhysicsBridge: vi.fn(() => ({
    physics3d_init: physics3dInit,
    physics3d_step: physics3dStep,
    physics3d_add_body: physics3dAddBody,
    physics3d_remove_body: physics3dRemoveBody,
    physics3d_has_body: physics3dHasBody,
    physics3d_get_body_state: physics3dGetBodyState,
    physics3d_set_body_state: physics3dSetBodyState,
    physics3d_get_linear_velocity: physics3dGetLinearVelocity,
    physics3d_set_linear_velocity: physics3dSetLinearVelocity,
    physics3d_get_angular_velocity: physics3dGetAngularVelocity,
    physics3d_set_angular_velocity: physics3dSetAngularVelocity,
    physics3d_apply_impulse: physics3dApplyImpulse,
    physics3d_get_body_kind: physics3dGetBodyKind,
    physics3d_set_body_kind: physics3dSetBodyKind,
    physics3d_add_box_collider: physics3dAddBoxCollider,
    physics3d_add_mesh_collider: physics3dAddMeshCollider,
    physics3d_add_convex_collider: physics3dAddConvexCollider,
  })),
};

vi.mock('@gwenjs/core', () => ({
  getWasmBridge: () => mockBridge,
}));

import { Physics3DPlugin, type Physics3DAPI } from '../src/index';
import type { GwenEngine } from '@gwenjs/core';

describe('Physics3D plugin — WASM backend mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wasmBodyState.clear();
    wasmLinVel.clear();
    wasmAngVel.clear();
    wasmKind.clear();
    physics3dAddBody.mockReturnValue(true);
    physics3dRemoveBody.mockReturnValue(true);
    physics3dGetBodyState.mockImplementation(
      (idx: number) => wasmBodyState.get(idx) ?? new Float32Array(13),
    );
  });

  function setup() {
    const plugin = Physics3DPlugin();
    const services = new Map<string, unknown>();
    const engine = {
      provide: vi.fn((name: string, v: unknown) => services.set(name, v)),
      inject: vi.fn((name: string) => services.get(name)),
      hooks: {
        hook: vi.fn(() => vi.fn()),
        callHook: vi.fn(),
      },
      getEntityGeneration: vi.fn(() => 0),
      query: vi.fn(() => []),
      getComponent: vi.fn(),
      wasmBridge: null,
    } as unknown as GwenEngine;
    plugin.setup(engine);
    const service = services.get('physics3d') as Physics3DAPI;
    return { plugin, service };
  }

  it('detects WASM backend and delegates createBody to physics3d_add_body', () => {
    const { service } = setup();

    service.createBody(10, { kind: 'dynamic', mass: 5 });

    expect(physics3dAddBody).toHaveBeenCalledWith(10, 0, 0, 0, 1 /* dynamic */, 5, 0, 0);
    expect(service.hasBody(10)).toBe(true);
    expect(service.getBodyCount()).toBe(1);
  });

  it('delegates createBody with initial position', () => {
    const { service } = setup();
    service.createBody(11, { initialPosition: { x: 1, y: 2, z: 3 } });

    expect(physics3dAddBody).toHaveBeenCalledWith(11, 1, 2, 3, 1, expect.any(Number), 0, 0);
  });

  it('calls physics3d_set_body_state for initial rotation/velocity', () => {
    const { service } = setup();
    service.createBody(12, {
      initialPosition: { x: 0, y: 0, z: 0 },
      initialRotation: { x: 0, y: 1, z: 0, w: 0 },
      initialLinearVelocity: { x: 5, y: 0, z: 0 },
    });

    expect(physics3dSetBodyState).toHaveBeenCalledWith(12, 0, 0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 0, 0);
  });

  it('delegates removeBody to physics3d_remove_body', () => {
    const { service } = setup();
    service.createBody(20);
    expect(service.removeBody(20)).toBe(true);
    expect(physics3dRemoveBody).toHaveBeenCalledWith(20);
    expect(service.hasBody(20)).toBe(false);
  });

  it('removeBody returns false for unknown entity', () => {
    const { service } = setup();
    expect(service.removeBody(404)).toBe(false);
    expect(physics3dRemoveBody).not.toHaveBeenCalled();
  });

  it('getBodyState delegates to physics3d_get_body_state', () => {
    const { service } = setup();
    wasmBodyState.set(30, new Float32Array([1, 2, 3, 0, 0, 0, 1, 4, 5, 6, 7, 8, 9]));
    service.createBody(30);

    const state = service.getBodyState(30);
    expect(state?.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(state?.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(state?.linearVelocity).toEqual({ x: 4, y: 5, z: 6 });
    expect(state?.angularVelocity).toEqual({ x: 7, y: 8, z: 9 });
    expect(physics3dGetBodyState).toHaveBeenCalledWith(30);
  });

  it('getBodyState returns undefined for unknown entity', () => {
    const { service } = setup();
    expect(service.getBodyState(404)).toBeUndefined();
  });

  it('setBodyState delegates to WASM after merging patch', () => {
    const { service } = setup();
    wasmBodyState.set(31, new Float32Array([1, 2, 3, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
    service.createBody(31);

    service.setBodyState(31, { position: { y: 99 }, linearVelocity: { x: 7 } });

    expect(physics3dSetBodyState).toHaveBeenCalledWith(31, 1, 99, 3, 0, 0, 0, 1, 7, 0, 0, 0, 0, 0);
  });

  it('getLinearVelocity / setLinearVelocity delegate to WASM', () => {
    const { service } = setup();
    wasmLinVel.set(40, new Float32Array([3, 4, 5]));
    service.createBody(40);

    expect(service.getLinearVelocity(40)).toEqual({ x: 3, y: 4, z: 5 });

    service.setLinearVelocity(40, { y: 99 });
    expect(physics3dSetLinearVelocity).toHaveBeenCalledWith(40, 3, 99, 5);
  });

  it('getAngularVelocity / setAngularVelocity delegate to WASM', () => {
    const { service } = setup();
    wasmAngVel.set(41, new Float32Array([1, 2, 3]));
    service.createBody(41);

    expect(service.getAngularVelocity(41)).toEqual({ x: 1, y: 2, z: 3 });

    service.setAngularVelocity(41, { z: 9 });
    expect(physics3dSetAngularVelocity).toHaveBeenCalledWith(41, 1, 2, 9);
  });

  it('applyImpulse delegates to WASM', () => {
    const { service } = setup();
    service.createBody(50);

    expect(service.applyImpulse(50, { x: 5, y: -1, z: 0 })).toBe(true);
    expect(physics3dApplyImpulse).toHaveBeenCalledWith(50, 5, -1, 0);
  });

  it('applyImpulse returns false for missing body', () => {
    const { service } = setup();
    expect(service.applyImpulse(999, { x: 1 })).toBe(false);
    expect(physics3dApplyImpulse).not.toHaveBeenCalled();
  });

  it('getBodyKind / setBodyKind delegate to WASM', () => {
    const { service } = setup();
    wasmKind.set(60, 1); // dynamic
    service.createBody(60);

    expect(service.getBodyKind(60)).toBe('dynamic');

    service.setBodyKind(60, 'fixed');
    expect(physics3dSetBodyKind).toHaveBeenCalledWith(60, 0 /* fixed */);
  });

  it('does NOT run local advanceLocalState during step in wasm mode', () => {
    const { service } = setup();
    wasmBodyState.set(70, new Float32Array(13)); // all zeros
    service.createBody(70, { initialLinearVelocity: { x: 10 } });

    service.step(1);

    expect(physics3dStep).toHaveBeenCalledWith(1);
    // In wasm mode, position is whatever WASM reports (all-zeros mock); local sim is NOT run.
    const state = service.getBodyState(70);
    // WASM mock returns zeros — local integration would have set position.x=10
    expect(state?.position.x).toBe(0);
    expect(physics3dGetBodyState).toHaveBeenCalled();
  });

  it('step calls physics3d_step with the provided delta', () => {
    const { service } = setup();
    service.step(1 / 30);
    expect(physics3dStep).toHaveBeenCalledWith(1 / 30);
  });
});

describe('Physics3D WASM backend — mesh and convex colliders', () => {
  beforeEach(() => {
    physics3dInit.mockReset();
    physics3dAddBody.mockReset().mockReturnValue(true);
    physics3dAddMeshCollider.mockReset().mockReturnValue(true);
    physics3dAddConvexCollider.mockReset().mockReturnValue(true);
  });

  function setupWithBody(entityId: number = 1) {
    const plugin = Physics3DPlugin();
    const services = new Map<string, unknown>();
    const engine = {
      provide: vi.fn((name: string, v: unknown) => services.set(name, v)),
      inject: vi.fn((name: string) => services.get(name)),
      hooks: {
        hook: vi.fn(() => vi.fn()),
        callHook: vi.fn(),
      },
      getEntityGeneration: vi.fn(() => 0),
      query: vi.fn(() => []),
      getComponent: vi.fn(),
      wasmBridge: null,
    } as unknown as GwenEngine;
    plugin.setup(engine);
    const service = services.get('physics3d') as Physics3DAPI;
    service.createBody(entityId);
    return { service };
  }

  it('delegates mesh collider to physics3d_add_mesh_collider in wasm mode', () => {
    const { service } = setupWithBody(1);
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const ok = service.addCollider(1, {
      shape: { type: 'mesh', vertices, indices },
      colliderId: 1,
    });
    expect(ok).toBe(true);
    expect(physics3dAddMeshCollider).toHaveBeenCalledOnce();
    const args = physics3dAddMeshCollider.mock.calls[0];
    // args[0] = entityIndex, args[1] = vertices, args[2] = indices
    expect(args[0]).toBe(1); // entityIndex
    expect(args[1]).toBe(vertices);
    expect(args[2]).toBe(indices);
  });

  it('delegates convex collider to physics3d_add_convex_collider in wasm mode', () => {
    const { service } = setupWithBody(2);
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const ok = service.addCollider(2, {
      shape: { type: 'convex', vertices },
      colliderId: 1,
      density: 2.5,
    });
    expect(ok).toBe(true);
    expect(physics3dAddConvexCollider).toHaveBeenCalledOnce();
    const args = physics3dAddConvexCollider.mock.calls[0];
    // args[0] = entityIndex, args[1] = vertices
    expect(args[0]).toBe(2);
    expect(args[1]).toBe(vertices);
  });

  it('returns false when physics3d_add_mesh_collider is absent from bridge', () => {
    // Simulate older WASM that lacks the new export
    physics3dAddMeshCollider.mockReturnValue(undefined);
    const { service } = setupWithBody(3);
    const ok = service.addCollider(3, {
      shape: {
        type: 'mesh',
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
      },
      colliderId: 1,
    });
    // Optional chaining (?.) returns undefined → false
    expect(ok).toBe(false);
  });
});
