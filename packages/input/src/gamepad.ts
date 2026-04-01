// packages/@gwenengine/plugin-input/src/gamepad.ts

/**
 * GamepadInput — wraps the Web Gamepad API with per-frame snapshotting.
 *
 * Snapshot strategy:
 * - `navigator.getGamepads()` is called ONCE per frame in `update()`.
 * - Button states are stored as `boolean[][]` (primitives), not as live
 *   Gamepad objects whose `.pressed` values are implementation-defined by W3C.
 * - `isButtonJustPressed` / `isButtonJustReleased` compare curr vs prev snapshot.
 */

export interface GamepadAxis {
  /** Raw value, -1 to 1 */
  value: number;
  /** Absolute value if above deadzone, else 0 */
  effective: number;
}

export class GamepadInput {
  private deadzone: number;

  /** Raw Gamepad refs — used for axis reading only (scalars are safe). */
  private snapshot: (Gamepad | null)[] = [];

  /** Button states this frame — boolean primitives, immutable after update(). */
  private currButtonStates: boolean[][] = [];

  /** Button states last frame — for edge detection. */
  private prevButtonStates: boolean[][] = [];

  constructor(deadzone = 0.15) {
    this.deadzone = deadzone;
  }

  /**
   * Advance one frame — must be called in InputPlugin.onBeforeUpdate().
   *
   * Snapshots button states as boolean[][] to avoid relying on live Gamepad
   * object mutability (W3C Gamepad API spec §6.4 — implementation-defined).
   */
  update(): void {
    this.prevButtonStates = this.currButtonStates;

    const pads =
      typeof navigator !== 'undefined' && navigator.getGamepads
        ? Array.from(navigator.getGamepads())
        : [];

    this.snapshot = pads;
    this.currButtonStates = pads.map((gp) => (gp ? Array.from(gp.buttons, (b) => b.pressed) : []));
  }

  /** Button held this frame (justPressed or held). */
  isButtonPressed(gamepadIndex: number, buttonIndex: number): boolean {
    return this.currButtonStates[gamepadIndex]?.[buttonIndex] ?? false;
  }

  /** Button pressed for the first time this frame (rising edge). */
  isButtonJustPressed(gamepadIndex: number, buttonIndex: number): boolean {
    const curr = this.currButtonStates[gamepadIndex]?.[buttonIndex] ?? false;
    const prev = this.prevButtonStates[gamepadIndex]?.[buttonIndex] ?? false;
    return curr && !prev;
  }

  /** Button released for the first time this frame (falling edge). */
  isButtonJustReleased(gamepadIndex: number, buttonIndex: number): boolean {
    const curr = this.currButtonStates[gamepadIndex]?.[buttonIndex] ?? false;
    const prev = this.prevButtonStates[gamepadIndex]?.[buttonIndex] ?? false;
    return !curr && prev;
  }

  /** Analog trigger value (0–1). */
  getButtonValue(gamepadIndex: number, buttonIndex: number): number {
    return this.snapshot[gamepadIndex]?.buttons[buttonIndex]?.value ?? 0;
  }

  /** Axis value with deadzone applied. */
  getAxis(gamepadIndex: number, axisIndex: number): GamepadAxis {
    const raw = this.snapshot[gamepadIndex]?.axes[axisIndex] ?? 0;
    return {
      value: raw,
      effective: Math.abs(raw) > this.deadzone ? raw : 0,
    };
  }

  /** Left analog stick (axes 0, 1) with deadzone. */
  getLeftStick(gamepadIndex: number): { x: number; y: number } {
    return {
      x: this.getAxis(gamepadIndex, 0).effective,
      y: this.getAxis(gamepadIndex, 1).effective,
    };
  }

  /** Right analog stick (axes 2, 3) with deadzone. */
  getRightStick(gamepadIndex: number): { x: number; y: number } {
    return {
      x: this.getAxis(gamepadIndex, 2).effective,
      y: this.getAxis(gamepadIndex, 3).effective,
    };
  }

  /** Number of connected gamepads. */
  connectedCount(): number {
    return this.snapshot.filter(Boolean).length;
  }
}
