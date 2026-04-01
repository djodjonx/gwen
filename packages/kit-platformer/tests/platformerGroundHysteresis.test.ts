import { describe, expect, it } from 'vitest';
import {
  createGroundHysteresisState,
  resolveGroundedWithHysteresis,
} from '../src/systems/platformer/groundHysteresis.js';

describe('groundHysteresis', () => {
  it('enters grounded only after the configured number of active frames', () => {
    const state = createGroundHysteresisState(false);

    expect(resolveGroundedWithHysteresis(state, true, { enterFrames: 2, exitFrames: 3 })).toBe(
      false,
    );
    expect(resolveGroundedWithHysteresis(state, true, { enterFrames: 2, exitFrames: 3 })).toBe(
      true,
    );
  });

  it('stays grounded during short sensor flicker and exits after threshold', () => {
    const state = createGroundHysteresisState(true);

    expect(resolveGroundedWithHysteresis(state, false, { enterFrames: 1, exitFrames: 3 })).toBe(
      true,
    );
    expect(resolveGroundedWithHysteresis(state, false, { enterFrames: 1, exitFrames: 3 })).toBe(
      true,
    );
    expect(resolveGroundedWithHysteresis(state, false, { enterFrames: 1, exitFrames: 3 })).toBe(
      false,
    );
  });

  it('sanitizes invalid frame thresholds', () => {
    const state = createGroundHysteresisState(false);

    expect(resolveGroundedWithHysteresis(state, true, { enterFrames: 0, exitFrames: -1 })).toBe(
      true,
    );
  });
});
