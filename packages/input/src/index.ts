/**
 * InputPlugin — manages all input devices (keyboard, mouse, gamepad).
 *
 * Registers keyboard, mouse, and gamepad via the engine's provide/inject registry.
 *
 * @example
 * ```typescript
 * import { InputPlugin } from '@gwenjs/input';
 *
 * export default defineConfig({
 *   plugins: [InputPlugin()],
 * });
 *
 * // In any plugin setup():
 * const keyboard = engine.inject('keyboard' as any) as KeyboardInput;
 * ```
 */

import { definePlugin } from '@gwenjs/kit';
import type { GwenPluginMeta } from '@gwenjs/kit';
import type { GwenEngine } from '@gwenjs/core';
import { KeyboardInput } from './keyboard';
import { MouseInput } from './mouse';
import { GamepadInput } from './gamepad';
import { InputMapper } from './mapping/InputMapper.js';
import type { InputMapConfig } from './mapping/types.js';

export { KeyboardInput } from './keyboard';
export { MouseInput } from './mouse';
export { GamepadInput } from './gamepad';
export type { KeyState } from './keyboard';
export type { MouseButton, MouseButtonState, MousePosition } from './mouse';
export type { GamepadAxis } from './gamepad';
export { InputMapper } from './mapping/InputMapper.js';
export type { InputMapConfig, ActionConfig, AnyBinding, InputType } from './mapping/types.js';
export { BindingType, InputType as InputTypeValues } from './mapping/types.js';
export { Keys, type KeyCode } from './constants/keys.js';
export {
  GamepadButtons,
  GamepadAxes,
  INPUT_PLUGIN_NAME,
  type GamepadButtonId,
  type GamepadAxisId,
} from './constants/gamepad.js';

/** Services provided by InputPlugin via engine.inject(). */
export interface InputPluginServices {
  keyboard: KeyboardInput;
  mouse: MouseInput;
  gamepad: GamepadInput;
}

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    keyboard: { from: '@gwenjs/input', exportName: 'KeyboardInput' },
    mouse: { from: '@gwenjs/input', exportName: 'MouseInput' },
    gamepad: { from: '@gwenjs/input', exportName: 'GamepadInput' },
  },
};

export interface InputPluginConfig {
  /** Canvas element for mouse position offset. */
  canvas?: HTMLCanvasElement;
  /** Event target for keyboard/mouse listeners (defaults to window). */
  eventTarget?: EventTarget;
  /** Deadzone for gamepad axes (0-1, default 0.15). */
  gamepadDeadzone?: number;
  /**
   * Optional input action map. If provided, registers an 'inputMapper'
   * service via engine.provide() — accessible by systems via
   * `engine.inject('inputMapper' as any) as InputMapper`.
   */
  actionMap?: InputMapConfig;
}

export const InputPlugin = definePlugin((config: InputPluginConfig = {}) => {
  let keyboard: KeyboardInput;
  let mouse: MouseInput;
  let gamepad: GamepadInput;
  let target: EventTarget;

  return {
    name: '@gwenjs/input',
    meta: pluginMeta,

    setup(engine: GwenEngine): void {
      target =
        config.eventTarget ??
        (typeof window !== 'undefined' ? window : (globalThis as unknown as EventTarget));

      keyboard = new KeyboardInput();
      mouse = new MouseInput();
      gamepad = new GamepadInput(config.gamepadDeadzone ?? 0.15);

      keyboard.attach(target);
      mouse.attach(target, config.canvas);

      engine.provide('keyboard' as any, keyboard);
      engine.provide('mouse' as any, mouse);
      engine.provide('gamepad' as any, gamepad);

      if (config.actionMap) {
        const mapper = new InputMapper();
        mapper.init(config.actionMap, keyboard, gamepad);
        engine.provide('inputMapper' as any, mapper);
      }
    },

    onBeforeUpdate(_dt: number): void {
      keyboard.update();
      mouse.update();
      gamepad.update();
    },

    teardown(): void {
      keyboard.detach(target);
      mouse.detach(target);
      keyboard.reset();
      mouse.reset();
    },
  };
});

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { useKeyboard, useMouse, useGamepad, useInputMapper } from './composables.js';
export { default } from './module.js';
