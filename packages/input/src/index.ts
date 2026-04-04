// ─── Plugin ────────────────────────────────────────────────────────────────────
export { InputPlugin } from './plugin/index.js';

// ─── Device classes & types ────────────────────────────────────────────────────
export { KeyboardInput } from './plugin/keyboard.js';
export { MouseInput } from './plugin/mouse.js';
export { GamepadInput } from './plugin/gamepad.js';
export type { KeyState } from './plugin/keyboard.js';
export type { MouseButton, MouseButtonState, MousePosition } from './plugin/mouse.js';
export type { GamepadAxis } from './plugin/gamepad.js';

// ─── InputMapper & action config ───────────────────────────────────────────────
export { InputMapper } from './plugin/mapping/InputMapper.js';
export type {
  InputMapConfig,
  ActionConfig,
  AnyBinding,
  InputType,
} from './plugin/mapping/types.js';
export { BindingType, InputType as InputTypeValues } from './plugin/mapping/types.js';

// ─── Constants ────────────────────────────────────────────────────────────────
export { Keys, type KeyCode } from './constants/keys.js';
export {
  GamepadButtons,
  GamepadAxes,
  INPUT_PLUGIN_NAME,
  type GamepadButtonId,
  type GamepadAxisId,
} from './constants/gamepad.js';

// ─── Plugin interfaces ─────────────────────────────────────────────────────────
export type { InputPluginServices, InputPluginConfig } from './plugin/index.js';

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { useKeyboard, useMouse, useGamepad, useInputMapper } from './composables.js';
