// packages/@djodjonx/plugin-input/src/mapping/types.ts
import type { KeyCode } from '../constants/keys.js';
import type { GamepadButtonId, GamepadAxisId } from '../constants/gamepad.js';

/** Discriminant for action type — determines which read method to use. */
export const InputType = {
  Button: 0, // isActionPressed / isActionJustPressed / isActionJustReleased
  Axis1D: 1, // readAxis1D (future)
  Axis2D: 2, // readAxis2D
} as const;
export type InputType = (typeof InputType)[keyof typeof InputType];

/** Discriminant for binding type — used in union discrimination. */
export const BindingType = {
  Key: 0,
  GamepadButton: 1,
  GamepadAxis: 2,
  Composite2D: 3,
} as const;

export interface KeyBinding {
  type: typeof BindingType.Key;
  key: KeyCode;
}

export interface GamepadButtonBinding {
  type: typeof BindingType.GamepadButton;
  button: GamepadButtonId;
  /** Gamepad slot (0–3). Default: 0. */
  gamepadIndex?: number;
}

export interface GamepadAxisBinding {
  type: typeof BindingType.GamepadAxis;
  axis: GamepadAxisId;
  gamepadIndex?: number;
}

/**
 * Composite 2D binding — maps 4 buttons/keys to a normalized {x, y} vector.
 * Each direction can be a KeyBinding or GamepadButtonBinding.
 */
export interface Composite2DBinding {
  type: typeof BindingType.Composite2D;
  up: KeyBinding | GamepadButtonBinding;
  down: KeyBinding | GamepadButtonBinding;
  left: KeyBinding | GamepadButtonBinding;
  right: KeyBinding | GamepadButtonBinding;
}

export type AnyBinding =
  | KeyBinding
  | GamepadButtonBinding
  | GamepadAxisBinding
  | Composite2DBinding;

export interface ActionConfig {
  type: InputType;
  bindings: AnyBinding[];
}

/**
 * Full input map declaration — passed to InputPlugin config or InputMapper.init().
 *
 * @example
 * const map: InputMapConfig = {
 *   name: 'game',
 *   actions: {
 *     Jump: { type: InputType.Button, bindings: [{ type: BindingType.Key, key: Keys.Space }] },
 *   }
 * };
 */
export interface InputMapConfig {
  name: string;
  actions: Record<string, ActionConfig>;
}
