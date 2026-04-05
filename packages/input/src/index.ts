// ─── Plugin ────────────────────────────────────────────────────────────────────
export { InputPlugin } from './plugin/index';

// ─── Device classes & types ────────────────────────────────────────────────────
export { KeyboardInput } from './plugin/keyboard';
export { MouseInput } from './plugin/mouse';
export { GamepadInput } from './plugin/gamepad';
export type { KeyState } from './plugin/keyboard';
export type { MouseButton, MouseButtonState, MousePosition } from './plugin/mouse';
export type { GamepadAxis } from './plugin/gamepad';

// ─── InputMapper & action config ───────────────────────────────────────────────
export { InputMapper } from './plugin/mapping/InputMapper';
export type { InputMapConfig, ActionConfig, AnyBinding, InputType } from './plugin/mapping/types';
export { BindingType, InputType as InputTypeValues } from './plugin/mapping/types';

// ─── Constants ────────────────────────────────────────────────────────────────
export { Keys, type KeyCode } from './constants/keys';
export {
  GamepadButtons,
  GamepadAxes,
  INPUT_PLUGIN_NAME,
  type GamepadButtonId,
  type GamepadAxisId,
} from './constants/gamepad';

// ─── Plugin interfaces ─────────────────────────────────────────────────────────
export type { InputPluginServices, InputPluginConfig } from './plugin/index';

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment';
export { useKeyboard, useMouse, useGamepad, useInputMapper } from './composables';

// Re-export module definition so 'modules: ["@gwenjs/input"]' works in gwen.config.ts
export { default } from './module';
