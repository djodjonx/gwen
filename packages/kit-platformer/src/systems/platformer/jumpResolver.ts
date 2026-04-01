export interface JumpResolverConfig {
  coyoteMs: number;
  jumpBufferWindowMs: number;
  postJumpLockMs: number;
}

export interface JumpResolverState {
  coyoteLeftMs: number;
  jumpBufferLeftMs: number;
  postJumpLockLeftMs: number;
  jumpConsumed: boolean;
}

export function createJumpResolverState(): JumpResolverState {
  return {
    coyoteLeftMs: 0,
    jumpBufferLeftMs: 0,
    postJumpLockLeftMs: 0,
    jumpConsumed: false,
  };
}

function decayTimer(value: number, dtMs: number): number {
  return Math.max(0, value - dtMs);
}

function nonNegative(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

export function stepJumpResolver(
  state: JumpResolverState,
  options: {
    dtMs: number;
    jumpJustPressed: boolean;
    isGrounded: boolean;
    config: JumpResolverConfig;
  },
): void {
  const coyoteMs = nonNegative(options.config.coyoteMs, 110);
  const jumpBufferWindowMs = nonNegative(options.config.jumpBufferWindowMs, 110);

  state.postJumpLockLeftMs = decayTimer(state.postJumpLockLeftMs, options.dtMs);
  state.coyoteLeftMs = options.isGrounded ? coyoteMs : decayTimer(state.coyoteLeftMs, options.dtMs);
  state.jumpBufferLeftMs = options.jumpJustPressed
    ? jumpBufferWindowMs
    : decayTimer(state.jumpBufferLeftMs, options.dtMs);
}

export function canApplyJump(state: JumpResolverState, isGrounded: boolean): boolean {
  return (
    state.jumpBufferLeftMs > 0 &&
    (isGrounded || state.coyoteLeftMs > 0) &&
    !state.jumpConsumed &&
    state.postJumpLockLeftMs === 0
  );
}

export function markJumpApplied(state: JumpResolverState, postJumpLockMs: number): void {
  state.jumpBufferLeftMs = 0;
  state.coyoteLeftMs = 0;
  state.jumpConsumed = true;
  state.postJumpLockLeftMs = nonNegative(postJumpLockMs, 80);
}

export function tryConfirmLanding(state: JumpResolverState, isGrounded: boolean): void {
  if (isGrounded && state.jumpConsumed && state.postJumpLockLeftMs === 0) {
    state.jumpConsumed = false;
  }
}
