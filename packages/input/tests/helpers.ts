/**
 * Shared test helpers for input plugin tests.
 */

/**
 * Simulate a keydown event on the target (or window if none given).
 */
export function fireKeyDown(code: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}

/**
 * Simulate a keyup event on the target (or window if none given).
 */
export function fireKeyUp(code: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

/**
 * Simulate a keydown event on window.
 */
export function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}

/**
 * Simulate a keyup event on window.
 */
export function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

/**
 * Create a mock keyboard input state.
 */
export function makeKeyboard(pressed: string[] = [], justPressed: string[] = []) {
  return {
    isPressed: (k: string) => pressed.includes(k),
    isJustPressed: (k: string) => justPressed.includes(k),
    isJustReleased: (_: string) => false,
  };
}

/**
 * Create a mock gamepad input state.
 */
export function makeGamepad(curr: number[] = [], prev: number[] = []) {
  return {
    isButtonPressed: (_: number, b: number) => curr.includes(b),
    isButtonJustPressed: (_: number, b: number) => curr.includes(b) && !prev.includes(b),
    isButtonJustReleased: (_: number, b: number) => !curr.includes(b) && prev.includes(b),
    getLeftStick: (_: number) => ({ x: 0, y: 0 }),
  };
}
