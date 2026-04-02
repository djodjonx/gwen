/**
 * Typed gamepad constants — Standard Gamepad API button/axis layout (Xbox mapping).
 *
 * @example
 * import { GamepadButtons } from '@gwenjs/input';
 * bindings: [{ type: BindingType.GamepadButton, button: GamepadButtons.South }]
 */
export const GamepadButtons = {
  South: 0, // A (Xbox) / Cross (PS)
  East: 1, // B / Circle
  West: 2, // X / Square
  North: 3, // Y / Triangle
  LeftBumper: 4,
  RightBumper: 5,
  LeftTrigger: 6,
  RightTrigger: 7,
  Select: 8,
  Start: 9,
  LeftStick: 10,
  RightStick: 11,
  DPadUp: 12,
  DPadDown: 13,
  DPadLeft: 14,
  DPadRight: 15,
} as const;

export type GamepadButtonId = (typeof GamepadButtons)[keyof typeof GamepadButtons];

export const GamepadAxes = {
  LeftStickX: 0,
  LeftStickY: 1,
  RightStickX: 2,
  RightStickY: 3,
} as const;

export type GamepadAxisId = (typeof GamepadAxes)[keyof typeof GamepadAxes];

/** Stable constant for setup validation — avoids magic string 'InputPlugin'. */
export const INPUT_PLUGIN_NAME = 'InputPlugin' as const;
