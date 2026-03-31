// packages/@djodjonx/gwen-kit-platformer/tests/createPlayerPrefab.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPlayerPrefab } from '../src/prefabs/player.js';
import { PLATFORMER_CONTROLLER_DEFAULTS } from '../src/components/PlatformerController.js';
import { SENSOR_ID_FOOT } from '@djodjonx/gwen-plugin-physics2d';

const makeApi = () => {
  const components = new Map<string, any>();
  return {
    createEntity: () => 1n as any,
    addComponent: vi.fn((_id: any, def: any, data: any) => {
      const key = typeof def === 'string' ? def : def.name;
      components.set(key, data);
    }),
    services: {
      has: () => false,
      get: vi.fn(),
    },
    _components: components,
  };
};

describe('createPlayerPrefab', () => {
  it('uses PlatformerPlayer as default name', () => {
    const prefab = createPlayerPrefab();
    expect(prefab.name).toBe('PlatformerPlayer');
  });

  it('supports a custom prefab name', () => {
    const prefab = createPlayerPrefab({ name: 'Hero' });
    expect(prefab.name).toBe('Hero');
  });

  it('uses controller defaults when no options are provided', () => {
    const prefab = createPlayerPrefab();
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    const ctrl = api._components.get('PlatformerController');
    expect(ctrl.units).toBe(PLATFORMER_CONTROLLER_DEFAULTS.units);
    expect(ctrl.pixelsPerMeter).toBe(PLATFORMER_CONTROLLER_DEFAULTS.pixelsPerMeter);
    expect(ctrl.speed).toBe(PLATFORMER_CONTROLLER_DEFAULTS.speed);
    expect(ctrl.jumpVelocity).toBe(PLATFORMER_CONTROLLER_DEFAULTS.jumpVelocity);
    expect(ctrl.jumpCoyoteMs).toBe(PLATFORMER_CONTROLLER_DEFAULTS.jumpCoyoteMs);
    expect(ctrl.jumpBufferWindowMs).toBe(PLATFORMER_CONTROLLER_DEFAULTS.jumpBufferWindowMs);
    expect(ctrl.groundEnterFrames).toBe(PLATFORMER_CONTROLLER_DEFAULTS.groundEnterFrames);
    expect(ctrl.groundExitFrames).toBe(PLATFORMER_CONTROLLER_DEFAULTS.groundExitFrames);
    expect(ctrl.postJumpLockMs).toBe(PLATFORMER_CONTROLLER_DEFAULTS.postJumpLockMs);
  });

  it('generates default colliders', () => {
    const prefab = createPlayerPrefab();
    const physics = (prefab.extensions as any).physics;

    expect(physics.colliders).toHaveLength(2);

    // Body
    expect(physics.colliders[0].shape).toBe('box');
    expect(physics.colliders[0].hw).toBe(15); // 30/2

    // Foot sensor
    expect(physics.colliders[1].isSensor).toBe(true);
    expect(physics.colliders[1].colliderId).toBe(SENSOR_ID_FOOT);
    // Default offset is computed in pixels from collider geometry: bodyHh + footHh.
    expect(physics.colliders[1].offsetY).toBe(17);
  });

  it('allows collider dimension overrides', () => {
    const prefab = createPlayerPrefab({
      colliders: {
        body: { w: 40, h: 40 },
        foot: { w: 20, h: 10, offset: 20 },
      },
    });
    const physics = (prefab.extensions as any).physics;

    expect(physics.colliders[0].hw).toBe(20);
    expect(physics.colliders[1].hw).toBe(10);
    // Explicit user override stays in pixels at kit level.
    expect(physics.colliders[1].offsetY).toBe(20);
  });

  it('allows extra colliders', () => {
    const prefab = createPlayerPrefab({
      extraColliders: [{ shape: 'ball', radius: 10, id: 'sensor' }],
    });
    const physics = (prefab.extensions as any).physics;
    expect(physics.colliders).toHaveLength(3);
    expect(physics.colliders[2].id).toBe('sensor');
  });

  it('supports movement overrides and units configuration', () => {
    const prefab = createPlayerPrefab({
      units: 'meters',
      pixelsPerMeter: 100,
      speed: 500,
      jumpVelocity: 800,
      jumpCoyoteMs: 140,
      jumpBufferWindowMs: 130,
      groundEnterFrames: 2,
      groundExitFrames: 3,
      postJumpLockMs: 55,
    });
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    const ctrl = api._components.get('PlatformerController');
    expect(ctrl.units).toBe('meters');
    expect(ctrl.pixelsPerMeter).toBe(100);
    expect(ctrl.speed).toBe(500);
    expect(ctrl.jumpVelocity).toBe(800);
    expect(ctrl.jumpCoyoteMs).toBe(140);
    expect(ctrl.jumpBufferWindowMs).toBe(130);
    expect(ctrl.groundEnterFrames).toBe(2);
    expect(ctrl.groundExitFrames).toBe(3);
    expect(ctrl.postJumpLockMs).toBe(55);
  });

  it('uses defaults when jump options are not provided', () => {
    const prefab = createPlayerPrefab({});
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    const ctrl = api._components.get('PlatformerController');

    expect(ctrl.jumpVelocity).toBe(PLATFORMER_CONTROLLER_DEFAULTS.jumpVelocity);
    expect(ctrl.jumpCoyoteMs).toBe(PLATFORMER_CONTROLLER_DEFAULTS.jumpCoyoteMs);
    expect(ctrl.jumpBufferWindowMs).toBe(PLATFORMER_CONTROLLER_DEFAULTS.jumpBufferWindowMs);
  });

  it('calls onCreated with api and id', () => {
    const onCreated = vi.fn();
    const prefab = createPlayerPrefab({ onCreated });
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    expect(onCreated).toHaveBeenCalledWith(api, 1n);
  });
});
