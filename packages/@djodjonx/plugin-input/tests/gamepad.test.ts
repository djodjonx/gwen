// packages/@djodjonx/plugin-input/tests/gamepad.test.ts
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

  it('isButtonJustPressed — rising edge détecté', () => {
    const g = new GamepadInput();

    // Frame 1 : bouton 0 relâché
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [makeGamepadState([false])],
      configurable: true,
    });
    g.update();
    expect(g.isButtonJustPressed(0, 0)).toBe(false);

    // Frame 2 : bouton 0 pressé
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [makeGamepadState([true])],
      configurable: true,
    });
    g.update();
    expect(g.isButtonJustPressed(0, 0)).toBe(true);
    expect(g.isButtonPressed(0, 0)).toBe(true);

    // Frame 3 : bouton toujours pressé → plus justPressed
    g.update();
    expect(g.isButtonJustPressed(0, 0)).toBe(false);
    expect(g.isButtonPressed(0, 0)).toBe(true);
  });

  it('isButtonJustReleased — falling edge détecté', () => {
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

  it('pas de gamepad connecté → retourne false sans erreur', () => {
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
