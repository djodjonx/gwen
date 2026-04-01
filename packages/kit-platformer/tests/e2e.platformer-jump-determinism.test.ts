import { describe, expect, it, vi } from 'vitest';
import { PlatformerController } from '../src/components/PlatformerController.js';
import { PlatformerIntent } from '../src/components/PlatformerIntent.js';
import { PlatformerMovementSystem } from '../src/systems/PlatformerMovementSystem.js';

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
    createLiveQuery: vi.fn(() => (overrides.entities ?? [])[Symbol.iterator]()),
    getComponent: vi.fn(overrides.getComponent ?? (() => undefined)),
  };
}

describe('PlatformerMovementSystem jump determinism', () => {
  it('prevents immediate double jump while jump lock is active', () => {
    const physics = {
      getLinearVelocity: vi.fn(() => ({ x: 0, y: 0 })),
      setLinearVelocity: vi.fn(),
      getSensorState: vi.fn(() => ({ isActive: true, contactCount: 1 })),
      isDebugEnabled: vi.fn(() => false),
    };

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

    const system = PlatformerMovementSystem();
    const engine = createMockEngine({
      physics,
      entities: [0n],
      getComponent: (_id: any, def: any) => {
        if (def === PlatformerController) return controller;
        if (def === PlatformerIntent) return { moveX: 0, jumpJustPressed: true, jumpPressed: true };
        return null;
      },
    });
    system.setup(engine);

    // Frame 1: jump accepted.
    system.onUpdate?.(1 / 60);

    // Frame 2: jump pressed again immediately, must be blocked.
    system.onUpdate?.(1 / 60);

    const jumpApplications = physics.setLinearVelocity.mock.calls.filter(
      (call: any[]) => call[call.length - 1] === -15,
    );
    expect(jumpApplications).toHaveLength(1);
  });
});
