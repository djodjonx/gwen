// packages/@gwenjs/plugin-input/tests/gamepad.test.ts
import { describe, it, expect } from 'vitest';
import { GamepadInput } from '../src/gamepad.js';

const makeGamepadState = (buttons: boolean[]): Gamepad =>
  ({
    buttons: buttons.map((pressed) => ({ pressed, value: pressed ? 1 : 0, touched: false })),
    axes: [0, 0, 0, 0],
  }) as unknown as Gamepad;

describe('GamepadInput', () => {
  // Ensure navigator exists in the test environment
  if (typeof (globalThis as any).navigator === 'undefined') {
    (globalThis as any).navigator = {};
  }

  it('isButtonJustPressed — rising edge detected', () => {
    const g = new GamepadInput();

    // Frame 1: button 0 released
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [makeGamepadState([false])],
      configurable: true,
    });
    g.update();
    expect(g.isButtonJustPressed(0, 0)).toBe(false);

    // Frame 2: button 0 pressed
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [makeGamepadState([true])],
      configurable: true,
    });
    g.update();
    expect(g.isButtonJustPressed(0, 0)).toBe(true);
    expect(g.isButtonPressed(0, 0)).toBe(true);

    // Frame 3: button still pressed → no longer justPressed
    g.update();
    expect(g.isButtonJustPressed(0, 0)).toBe(false);
    expect(g.isButtonPressed(0, 0)).toBe(true);
  });

  it('isButtonJustReleased — falling edge detected', () => {
    const g = new GamepadInput();

    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [makeGamepadState([true])],
      configurable: true,
    });
    g.update();

    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [makeGamepadState([false])],
      configurable: true,
    });
    g.update();
    expect(g.isButtonJustReleased(0, 0)).toBe(true);
    expect(g.isButtonPressed(0, 0)).toBe(false);
  });

  it('no gamepad connected → returns false without error', () => {
    const g = new GamepadInput();
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [null],
      configurable: true,
    });
    g.update();
    expect(g.isButtonPressed(0, 0)).toBe(false);
    expect(g.isButtonJustPressed(0, 0)).toBe(false);
  });
});
