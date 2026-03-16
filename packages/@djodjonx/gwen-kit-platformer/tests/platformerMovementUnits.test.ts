import { describe, it, expect, vi } from 'vitest';
import { PlatformerMovementSystem } from '../src/systems/PlatformerMovementSystem.js';
import { PlatformerController } from '../src/components/PlatformerController.js';
import { PlatformerIntent } from '../src/components/PlatformerIntent.js';
import { toPhysicsScalar, DEFAULT_PIXELS_PER_METER } from '../src/units.js';

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
  it('converts speed, jumpForce and maxFallSpeed from pixels to meters', () => {
    const physics = makePhysics({ getLinearVelocity: vi.fn(() => ({ x: 0, y: -30 })) });
    const system = PlatformerMovementSystem();

    system.onInit?.({
      services: { get: () => physics },
      hooks: { hook: vi.fn() },
    } as any);

    system.onUpdate?.(
      {
        query: () => [0n],
        getComponent: (_id: bigint, def: any) => {
          if (def === PlatformerController) {
            return {
              units: 'pixels',
              pixelsPerMeter: 50,
              speed: 400,
              jumpForce: 750,
              maxFallSpeed: 600,
              coyoteMs: 110,
              jumpBufferMs: 110,
            };
          }
          if (def === PlatformerIntent)
            return { moveX: 1, jumpJustPressed: true, jumpPressed: true };
          return null;
        },
      } as any,
      1 / 60,
    );

    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(1, 0, 8, -12);
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(2, 0, 8, -15);
  });

  it('keeps movement values unchanged when units is meters', () => {
    const physics = makePhysics();
    const system = PlatformerMovementSystem();

    system.onInit?.({
      services: { get: () => physics },
      hooks: { hook: vi.fn() },
    } as any);

    system.onUpdate?.(
      {
        query: () => [0n],
        getComponent: (_id: bigint, def: any) => {
          if (def === PlatformerController) {
            return {
              units: 'meters',
              pixelsPerMeter: 50,
              speed: 8,
              jumpForce: 15,
              maxFallSpeed: 12,
              coyoteMs: 110,
              jumpBufferMs: 110,
            };
          }
          if (def === PlatformerIntent)
            return { moveX: 1, jumpJustPressed: true, jumpPressed: true };
          return null;
        },
      } as any,
      1 / 60,
    );

    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(1, 0, 8, 0);
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(2, 0, 8, -15);
  });

  it('applies horizontal movement without jump when jumpJustPressed is false', () => {
    const physics = makePhysics();
    const system = PlatformerMovementSystem();

    system.onInit?.({
      services: { get: () => physics },
      hooks: { hook: vi.fn() },
    } as any);

    system.onUpdate?.(
      {
        query: () => [0n],
        getComponent: (_id: bigint, def: any) => {
          if (def === PlatformerController) {
            return {
              units: 'pixels',
              pixelsPerMeter: 50,
              speed: 300,
              jumpForce: 500,
              maxFallSpeed: 600,
              coyoteMs: 110,
              jumpBufferMs: 110,
            };
          }
          if (def === PlatformerIntent)
            return { moveX: -1, jumpJustPressed: false, jumpPressed: false };
          return null;
        },
      } as any,
      1 / 60,
    );

    // Only one setLinearVelocity call — no jump triggered
    expect(physics.setLinearVelocity).toHaveBeenCalledTimes(1);
    expect(physics.setLinearVelocity).toHaveBeenCalledWith(0, -6, 0);
  });

  it('respects custom pixelsPerMeter in pixels mode', () => {
    const physics = makePhysics({ getLinearVelocity: vi.fn(() => ({ x: 0, y: -100 })) });
    const system = PlatformerMovementSystem();

    system.onInit?.({
      services: { get: () => physics },
      hooks: { hook: vi.fn() },
    } as any);

    system.onUpdate?.(
      {
        query: () => [0n],
        getComponent: (_id: bigint, def: any) => {
          if (def === PlatformerController) {
            return {
              units: 'pixels',
              pixelsPerMeter: 100,
              speed: 400,
              jumpForce: 600,
              maxFallSpeed: 500,
              coyoteMs: 110,
              jumpBufferMs: 110,
            };
          }
          if (def === PlatformerIntent)
            return { moveX: 1, jumpJustPressed: true, jumpPressed: true };
          return null;
        },
      } as any,
      1 / 60,
    );

    // speed=400/100=4, maxFallSpeed=500/100=5 → clamp(-100, -5)=-5, jumpForce=600/100=6
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(1, 0, 4, -5);
    expect(physics.setLinearVelocity).toHaveBeenNthCalledWith(2, 0, 4, -6);
  });
});
