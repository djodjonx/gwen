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

  /**
   * Create a GamepadInput instance.
   *
   * @param deadzone Minimum axis value threshold (default: 0.15). Values below this are ignored.
   *
   * @example
   * ```typescript
   * const gamepad = new GamepadInput(0.1);  // Tighter deadzone
   * ```
   */
  constructor(deadzone = 0.15) {
    this.deadzone = deadzone;
  }

  /**
   * Check if a gamepad button is currently pressed.
   *
   * @param gamepadIndex Gamepad index (0-3)
   * @param buttonIndex Standard gamepad button index (0=A, 1=B, etc.)
   * @returns true if button is currently pressed
   */
  isButtonPressed(gamepadIndex: number, buttonIndex: number): boolean {
    const gp = this.getGamepad(gamepadIndex);
    return gp?.buttons[buttonIndex]?.pressed ?? false;
  }

  /**
   * Get the pressure/value of a gamepad button (for analog triggers).
   * Returns 0-1 range.
   *
   * @param gamepadIndex Gamepad index
   * @param buttonIndex Button index
   * @returns Analog value 0-1, or 0 if not connected
   */
  getButtonValue(gamepadIndex: number, buttonIndex: number): number {
    const gp = this.getGamepad(gamepadIndex);
    return gp?.buttons[buttonIndex]?.value ?? 0;
  }

  /**
   * Get axis value with deadzone applied.
   * Returns both raw and effective (deadzone-filtered) values.
   *
   * @param gamepadIndex Gamepad index
   * @param axisIndex Axis index (0=LX, 1=LY, 2=RX, 3=RY)
   * @returns GamepadAxis with raw and effective values
   */
  getAxis(gamepadIndex: number, axisIndex: number): GamepadAxis {
    const gp = this.getGamepad(gamepadIndex);
    const raw = gp?.axes[axisIndex] ?? 0;
    return {
      value: raw,
      effective: Math.abs(raw) > this.deadzone ? raw : 0,
    };
  }

  /**
   * Get left analog stick position with deadzone applied.
   *
   * @param gamepadIndex Gamepad index
   * @returns Object with x/y fields (-1 to 1, or 0 if below deadzone)
   *
   * @example
   * ```typescript
   * const stick = gamepad.getLeftStick(0);
   * player.move(stick.x, stick.y);
   * ```
   */
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

  /**
   * Get the number of connected gamepads.
   *
   * @returns Number of connected gamepads (0-4)
   */
  connectedCount(): number {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    return Array.from(navigator.getGamepads()).filter(Boolean).length;
  }

  /**
   * Get a Gamepad object by index.
   * Returns null if not connected or gamepad API unavailable.
   *
   * @param index Gamepad index
   * @returns Gamepad object or null
   * @internal
   */
  private getGamepad(index: number): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    return navigator.getGamepads()[index] ?? null;
  }
}
