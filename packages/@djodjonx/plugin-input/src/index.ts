/**
 * InputPlugin — manages all input devices (keyboard, mouse, gamepad).
 *
 * Registers keyboard, mouse, and gamepad as services in `api.services`.
 *
 * @example
 * ```typescript
 * import { InputPlugin } from '@djodjonx/gwen-plugin-input';
 *
 * export default defineConfig({
 *   plugins: [new InputPlugin()],
 * });
 *
 * // In any plugin onInit():
 * const keyboard = api.services.get('keyboard') as KeyboardInput;
 * ```
 */

import { definePlugin } from '@djodjonx/gwen-kit';
import type { GwenPluginMeta } from '@djodjonx/gwen-kit';
import { KeyboardInput } from './keyboard';
import { MouseInput } from './mouse';
import { GamepadInput } from './gamepad';

export { KeyboardInput } from './keyboard';
export { MouseInput } from './mouse';
export { GamepadInput } from './gamepad';
export type { KeyState } from './keyboard';
export type { MouseButton, MouseButtonState, MousePosition } from './mouse';
export type { GamepadAxis } from './gamepad';

/** Services provided by InputPlugin in api.services. */
export interface InputPluginServices {
  keyboard: KeyboardInput;
  mouse: MouseInput;
  gamepad: GamepadInput;
}

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    keyboard: { from: '@djodjonx/gwen-plugin-input', exportName: 'KeyboardInput' },
    mouse: { from: '@djodjonx/gwen-plugin-input', exportName: 'MouseInput' },
    gamepad: { from: '@djodjonx/gwen-plugin-input', exportName: 'GamepadInput' },
  },
};

export interface InputPluginConfig {
  /** Canvas element for mouse position offset. */
  canvas?: HTMLCanvasElement;
  /** Event target for keyboard/mouse listeners (defaults to window). */
  eventTarget?: EventTarget;
  /** Deadzone for gamepad axes (0-1, default 0.15). */
  gamepadDeadzone?: number;
}

export const InputPlugin = definePlugin((config: InputPluginConfig = {}) => {
  let keyboard: KeyboardInput;
  let mouse: MouseInput;
  let gamepad: GamepadInput;
  let target: EventTarget;

  return {
    name: 'InputPlugin',
    meta: pluginMeta,
    provides: {
      keyboard: {} as KeyboardInput,
      mouse: {} as MouseInput,
      gamepad: {} as GamepadInput,
    },

    onInit(api): void {
      target =
        config.eventTarget ??
        (typeof window !== 'undefined' ? window : (globalThis as unknown as EventTarget));

      keyboard = new KeyboardInput();
      mouse = new MouseInput();
      gamepad = new GamepadInput(config.gamepadDeadzone ?? 0.15);

      keyboard.attach(target);
      mouse.attach(target, config.canvas);

      api.services.register('keyboard', keyboard);
      api.services.register('mouse', mouse);
      api.services.register('gamepad', gamepad);
    },

    onBeforeUpdate(_api, _dt): void {
      keyboard.update();
      mouse.update();
    },

    onDestroy(): void {
      keyboard.detach(target);
      mouse.detach(target);
      keyboard.reset();
      mouse.reset();
    },
  };
});
