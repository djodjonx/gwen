import { describe, it, expect, vi } from 'vitest';
import { PlatformerMovementSystem } from '../src/systems/PlatformerMovementSystem.js';
import { PlatformerController } from '../src/components/PlatformerController.js';
import { PlatformerIntent } from '../src/components/PlatformerIntent.js';
import { toPhysicsScalar, DEFAULT_PIXELS_PER_METER } from '../src/units.js';

// ─── V2 engine mock helper ────────────────────────────────────────────────────

function createMockEngine(
  overrides: {
    physics?: any;
    entities?: any[];
    getComponent?: (id: any, def: any) => any;
  } = {},
): any {
  const svc = new Map<string, unknown>();
  if (overrides.physics) svc.set('physics', overrides.physics);

  const hookCallbacks = new Map<string, (...args: any[]) => any>();

  return {
    provide: (key: string, value: unknown) => {
      svc.set(key, value);
    },
    inject: (key: string) => {
      const v = svc.get(key);
      if (v === undefined) throw new Error(`No service: ${key}`);
      return v;
    },
    tryInject: (key: string) => svc.get(key),
    hooks: {
      hook: vi.fn((name: string, callback: (...args: any[]) => any) => {
        hookCallbacks.set(name, callback);
        return vi.fn();
      }),
      callHook: vi.fn(),
    },
    _hookCallbacks: hookCallbacks,
    createLiveQuery: vi.fn(() => {
      const entities = overrides.entities ?? [];
      const accessors = entities.map((e: unknown) => ({
        id: e,
        get: () => undefined,
        has: () => false,
      }));
      return accessors[Symbol.iterator]();
    }),
    getComponent: vi.fn(overrides.getComponent ?? (() => undefined)),
  };
}

// ─── toPhysicsScalar unit tests ───────────────────────────────────────────────

describe('toPhysicsScalar', () => {
  it('divides by pixelsPerMeter when units is pixels', () => {
    expect(toPhysicsScalar(400, 'pixels', 50)).toBe(8);
  });

  it('returns value unchanged when units is meters', () => {
    expect(toPhysicsScalar(8, 'meters', 50)).toBe(8);
  });

  it('falls back to DEFAULT_PIXELS_PER_METER when ppm is 0', () => {
    expect(toPhysicsScalar(400, 'pixels', 0)).toBe(400 / DEFAULT_PIXELS_PER_METER);
  });

  it('falls back to DEFAULT_PIXELS_PER_METER when ppm is negative', () => {
    expect(toPhysicsScalar(400, 'pixels', -10)).toBe(400 / DEFAULT_PIXELS_PER_METER);
  });

  it('falls back to DEFAULT_PIXELS_PER_METER when ppm is NaN', () => {
    expect(toPhysicsScalar(400, 'pixels', NaN)).toBe(400 / DEFAULT_PIXELS_PER_METER);
  });
});

function makePhysics(overrides: Partial<any> = {}) {
  return {
    getLinearVelocity: vi.fn(() => ({ x: 0, y: 0 })),
    setLinearVelocity: vi.fn(),
    getSensorState: vi.fn(() => ({ isActive: true, contactCount: 1 })),
    ...overrides,
  };
}

describe('PlatformerMovementSystem units conversion', () => {
  it('converts speed, jumpVelocity and maxFallSpeed from pixels to meters', () => {
    const physics = makePhysics({ getLinearVelocity: vi.fn(() => ({ x: 0, y: -30 })) });
    const system = PlatformerMovementSystem();

    const engine = createMockEngine({
      physics,
      entities: [0n],
      getComponent: (_id: any, def: any) => {
        if (def === PlatformerController) {
          return {
            units: 'pixels',
            pixelsPerMeter: 50,
            speed: 400,
            jumpVelocity: 750,
            maxFallSpeed: 600,
            jumpCoyoteMs: 110,
            jumpBufferWindowMs: 110,
            groundEnterFrames: 1,
            groundExitFrames: 4,
            postJumpLockMs: 80,
          };
        }
        if (def === PlatformerIntent) return { moveX: 1, jumpJustPressed: true, jumpPressed: true };
        return null;
      },
    });
    system.setup(engine);
    system.onUpdate?.(1 / 60);

    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(1, 0n, 8, -12);
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(2, 0n, 8, -15);
  });

  it('keeps movement values unchanged when units is meters', () => {
    const physics = makePhysics();
    const system = PlatformerMovementSystem();

    const engine = createMockEngine({
      physics,
      entities: [0n],
      getComponent: (_id: any, def: any) => {
        if (def === PlatformerController) {
          return {
            units: 'meters',
            pixelsPerMeter: 50,
            speed: 8,
            jumpVelocity: 15,
            maxFallSpeed: 12,
            jumpCoyoteMs: 110,
            jumpBufferWindowMs: 110,
            groundEnterFrames: 1,
            groundExitFrames: 4,
            postJumpLockMs: 80,
          };
        }
        if (def === PlatformerIntent) return { moveX: 1, jumpJustPressed: true, jumpPressed: true };
        return null;
      },
    });
    system.setup(engine);
    system.onUpdate?.(1 / 60);

    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(1, 0n, 8, 0);
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(2, 0n, 8, -15);
  });

  it('applies horizontal movement without jump when jumpJustPressed is false', () => {
    const physics = makePhysics();
    const system = PlatformerMovementSystem();

    const engine = createMockEngine({
      physics,
      entities: [0n],
      getComponent: (_id: any, def: any) => {
        if (def === PlatformerController) {
          return {
            units: 'pixels',
            pixelsPerMeter: 50,
            speed: 300,
            jumpVelocity: 500,
            maxFallSpeed: 600,
            jumpCoyoteMs: 110,
            jumpBufferWindowMs: 110,
            groundEnterFrames: 1,
            groundExitFrames: 4,
            postJumpLockMs: 80,
          };
        }
        if (def === PlatformerIntent)
          return { moveX: -1, jumpJustPressed: false, jumpPressed: false };
        return null;
      },
    });
    system.setup(engine);
    system.onUpdate?.(1 / 60);

    // Only one setLinearVelocity call — no jump triggered
    expect(physics.setLinearVelocity).toHaveBeenCalledTimes(1);
    expect(physics.setLinearVelocity).toHaveBeenCalledWith(0n, -6, 0);
  });

  it('respects custom pixelsPerMeter in pixels mode', () => {
    const physics = makePhysics({ getLinearVelocity: vi.fn(() => ({ x: 0, y: -100 })) });
    const system = PlatformerMovementSystem();

    const engine = createMockEngine({
      physics,
      entities: [0n],
      getComponent: (_id: any, def: any) => {
        if (def === PlatformerController) {
          return {
            units: 'pixels',
            pixelsPerMeter: 100,
            speed: 400,
            jumpVelocity: 600,
            maxFallSpeed: 500,
            jumpCoyoteMs: 110,
            jumpBufferWindowMs: 110,
            groundEnterFrames: 1,
            groundExitFrames: 4,
            postJumpLockMs: 80,
          };
        }
        if (def === PlatformerIntent) return { moveX: 1, jumpJustPressed: true, jumpPressed: true };
        return null;
      },
    });
    system.setup(engine);
    system.onUpdate?.(1 / 60);

    // speed=400/100=4, maxFallSpeed=500/100=5 -> clamp(-100, -5)=-5, jumpVelocity=600/100=6
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(1, 0n, 4, -5);
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(2, 0n, 4, -6);
  });

  it('uses jump fields from PlatformerController v2 schema', () => {
    const physics = makePhysics();
    const system = PlatformerMovementSystem();

    const engine = createMockEngine({
      physics,
      entities: [0n],
      getComponent: (_id: any, def: any) => {
        if (def === PlatformerController) {
          return {
            units: 'meters',
            pixelsPerMeter: 50,
            speed: 8,
            jumpVelocity: 16,
            maxFallSpeed: 12,
            jumpCoyoteMs: 120,
            jumpBufferWindowMs: 120,
          };
        }
        if (def === PlatformerIntent) return { moveX: 1, jumpJustPressed: true, jumpPressed: true };
        return null;
      },
    });
    system.setup(engine);
    system.onUpdate?.(1 / 60);

    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(1, 0n, 8, 0);
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(2, 0n, 8, -16);
  });
});
