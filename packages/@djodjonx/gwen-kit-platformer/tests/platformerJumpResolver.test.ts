import { describe, expect, it } from 'vitest';
import {
  canApplyJump,
  createJumpResolverState,
  markJumpApplied,
  stepJumpResolver,
  tryConfirmLanding,
} from '../src/systems/platformer/jumpResolver.js';

describe('jumpResolver', () => {
  it('opens jump gate when buffered input meets grounded condition', () => {
    const state = createJumpResolverState();

    stepJumpResolver(state, {
      dtMs: 16,
      jumpJustPressed: true,
      isGrounded: true,
      config: { coyoteMs: 100, jumpBufferWindowMs: 120, postJumpLockMs: 80 },
    });

    expect(canApplyJump(state, true)).toBe(true);
  });

  it('consumes jump and blocks re-trigger until landing is confirmed', () => {
    const state = createJumpResolverState();

    stepJumpResolver(state, {
      dtMs: 16,
      jumpJustPressed: true,
      isGrounded: true,
      config: { coyoteMs: 100, jumpBufferWindowMs: 120, postJumpLockMs: 80 },
    });
    markJumpApplied(state, 80);

    expect(canApplyJump(state, false)).toBe(false);

    stepJumpResolver(state, {
      dtMs: 80,
      jumpJustPressed: false,
      isGrounded: false,
      config: { coyoteMs: 100, jumpBufferWindowMs: 120, postJumpLockMs: 80 },
    });
    tryConfirmLanding(state, true);

    expect(state.jumpConsumed).toBe(false);
  });

  it('supports coyote jump while airborne shortly after leaving ground', () => {
    const state = createJumpResolverState();

    stepJumpResolver(state, {
      dtMs: 16,
      jumpJustPressed: false,
      isGrounded: true,
      config: { coyoteMs: 90, jumpBufferWindowMs: 100, postJumpLockMs: 80 },
    });

    stepJumpResolver(state, {
      dtMs: 30,
      jumpJustPressed: true,
      isGrounded: false,
      config: { coyoteMs: 90, jumpBufferWindowMs: 100, postJumpLockMs: 80 },
    });

    expect(canApplyJump(state, false)).toBe(true);
  });
});
