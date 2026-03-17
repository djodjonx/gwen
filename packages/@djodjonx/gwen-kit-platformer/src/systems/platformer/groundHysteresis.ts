export interface GroundHysteresisConfig {
  enterFrames: number;
  exitFrames: number;
}

export interface GroundHysteresisState {
  isGrounded: boolean;
  consecutiveGroundFrames: number;
  consecutiveAirFrames: number;
}

export function createGroundHysteresisState(initialGrounded = false): GroundHysteresisState {
  return {
    isGrounded: initialGrounded,
    consecutiveGroundFrames: initialGrounded ? 1 : 0,
    consecutiveAirFrames: initialGrounded ? 0 : 1,
  };
}

function normalizeFrameThreshold(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export function resolveGroundedWithHysteresis(
  state: GroundHysteresisState,
  sensorGrounded: boolean,
  config: GroundHysteresisConfig,
): boolean {
  const enterFrames = normalizeFrameThreshold(config.enterFrames, 1);
  const exitFrames = normalizeFrameThreshold(config.exitFrames, 4);

  if (sensorGrounded) {
    state.consecutiveGroundFrames += 1;
    state.consecutiveAirFrames = 0;
  } else {
    state.consecutiveAirFrames += 1;
    state.consecutiveGroundFrames = 0;
  }

  if (state.isGrounded) {
    if (!sensorGrounded && state.consecutiveAirFrames >= exitFrames) {
      state.isGrounded = false;
    }
  } else if (sensorGrounded && state.consecutiveGroundFrames >= enterFrames) {
    state.isGrounded = true;
  }

  return state.isGrounded;
}
