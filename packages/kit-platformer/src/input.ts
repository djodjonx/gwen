import { Keys, GamepadButtons, BindingType, InputTypeValues as InputType } from '@gwenengine/input';
import type { InputMapConfig } from '@gwenengine/input';

/**
 * Default input map for a 2D platformer.
 *
 * Move  — WASD + Arrow Keys + Left Stick
 * Jump  — Space / W / ArrowUp / Gamepad South (A)
 *
 * Pass as `actionMap` to InputPlugin to activate:
 * @example
 * new InputPlugin({ actionMap: PlatformerDefaultInputMap })
 */
export const PlatformerDefaultInputMap: InputMapConfig = {
  name: 'platformer',
  actions: {
    Move: {
      type: InputType.Axis2D,
      bindings: [
        {
          type: BindingType.Composite2D,
          left: { type: BindingType.Key, key: Keys.ArrowLeft },
          right: { type: BindingType.Key, key: Keys.ArrowRight },
          up: { type: BindingType.Key, key: Keys.ArrowUp },
          down: { type: BindingType.Key, key: Keys.ArrowDown },
        },
        {
          type: BindingType.Composite2D,
          left: { type: BindingType.Key, key: Keys.A },
          right: { type: BindingType.Key, key: Keys.D },
          up: { type: BindingType.Key, key: Keys.W },
          down: { type: BindingType.Key, key: Keys.S },
        },
      ],
    },
    Jump: {
      type: InputType.Button,
      bindings: [
        { type: BindingType.Key, key: Keys.Space },
        { type: BindingType.Key, key: Keys.ArrowUp },
        { type: BindingType.Key, key: Keys.W },
        { type: BindingType.GamepadButton, button: GamepadButtons.South, gamepadIndex: 0 },
      ],
    },
  },
};
