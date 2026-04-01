import { describe, expect, it, vi } from 'vitest';
import { PlatformerController } from '../src/components/PlatformerController.js';
import { PlatformerIntent } from '../src/components/PlatformerIntent.js';
import { PlatformerMovementSystem } from '../src/systems/PlatformerMovementSystem.js';

describe('PlatformerMovementSystem jump determinism', () => {
  it('prevents immediate double jump while jump lock is active', () => {
    const physics = {
      getLinearVelocity: vi.fn(() => ({ x: 0, y: 0 })),
      setLinearVelocity: vi.fn(),
      getSensorState: vi.fn(() => ({ isActive: true, contactCount: 1 })),
      isDebugEnabled: vi.fn(() => false),
    };

    const system = PlatformerMovementSystem();
    system.onInit?.({
      services: { get: () => physics },
      hooks: { hook: vi.fn() },
    } as any);

    const controller = {
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

    // Frame 1: jump accepted.
    system.onUpdate?.(
      {
        query: () => [0n],
        getComponent: (_id: bigint, def: any) => {
          if (def === PlatformerController) return controller;
          if (def === PlatformerIntent)
            return { moveX: 0, jumpJustPressed: true, jumpPressed: true };
          return null;
        },
      } as any,
      1 / 60,
    );

    // Frame 2: jump pressed again immediately, must be blocked.
    system.onUpdate?.(
      {
        query: () => [0n],
        getComponent: (_id: bigint, def: any) => {
          if (def === PlatformerController) return controller;
          if (def === PlatformerIntent)
            return { moveX: 0, jumpJustPressed: true, jumpPressed: true };
          return null;
        },
      } as any,
      1 / 60,
    );

    const jumpApplications = physics.setLinearVelocity.mock.calls.filter(
      (call: any[]) => call[call.length - 1] === -15,
    );
    expect(jumpApplications).toHaveLength(1);
  });
});
