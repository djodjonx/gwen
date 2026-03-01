/**
 * GamepadInput — wraps the Web Gamepad API
 *
 * Polls gamepad state each frame (Gamepad API is poll-based, not event-based).
 * Supports up to 4 gamepads.
 */

export interface GamepadAxis {
  /** Raw value, -1 to 1 */
  value: number;
  /** Absolute value if above deadzone, else 0 */
  effective: number;
}

export class GamepadInput {
  private deadzone: number;

  constructor(deadzone = 0.15) {
    this.deadzone = deadzone;
  }

  /**
   * Poll the current state of a gamepad button.
   * @param gamepadIndex 0-3
   * @param buttonIndex standard mapping button index
   */
  isButtonPressed(gamepadIndex: number, buttonIndex: number): boolean {
    const gp = this.getGamepad(gamepadIndex);
    return gp?.buttons[buttonIndex]?.pressed ?? false;
  }

  /** Button value (0 to 1, for analog triggers). */
  getButtonValue(gamepadIndex: number, buttonIndex: number): number {
    const gp = this.getGamepad(gamepadIndex);
    return gp?.buttons[buttonIndex]?.value ?? 0;
  }

  /** Axis value with deadzone applied. */
  getAxis(gamepadIndex: number, axisIndex: number): GamepadAxis {
    const gp = this.getGamepad(gamepadIndex);
    const raw = gp?.axes[axisIndex] ?? 0;
    return {
      value: raw,
      effective: Math.abs(raw) > this.deadzone ? raw : 0,
    };
  }

  /** Left stick (axes 0, 1). */
  getLeftStick(gamepadIndex: number): { x: number; y: number } {
    return {
      x: this.getAxis(gamepadIndex, 0).effective,
      y: this.getAxis(gamepadIndex, 1).effective,
    };
  }

  /** Right stick (axes 2, 3). */
  getRightStick(gamepadIndex: number): { x: number; y: number } {
    return {
      x: this.getAxis(gamepadIndex, 2).effective,
      y: this.getAxis(gamepadIndex, 3).effective,
    };
  }

  /** How many gamepads are currently connected. */
  connectedCount(): number {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    return Array.from(navigator.getGamepads()).filter(Boolean).length;
  }

  private getGamepad(index: number): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    return navigator.getGamepads()[index] ?? null;
  }
}
